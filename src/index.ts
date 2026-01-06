import bcrypt from "bcryptjs";
import { DurableObject } from "cloudflare:workers";
import {loginPageHtml} from "./page_templates";

export interface Env {
	KV: KVNamespace;
	SKIP_AUTH: boolean;
	ASSETS: Fetcher;
	GAME_DATA_SERVER: DurableObjectNamespace<GameDataServer>;
}

// Serializable card representation (without PixiJS container)
interface SerializedCard {
	suit: 'hearts' | 'diamonds' | 'clubs' | 'spades';
	rank: number;
	id: string;
}

interface SerializedPlacement {
	cards: SerializedCard[];
	type: 'single' | 'multiple' | 'straight';
}

type GamePhase =
	| 'selecting-hidden-reserve'
	| 'selecting-visible-reserve'
	| 'player-turn'
	| 'computer-turn'
	| 'game-over';

// Complete game state that gets persisted
interface GameState {
	deck: SerializedCard[];
	stack: SerializedCard[];
	playerHand: SerializedCard[];
	playerHiddenReserve: SerializedCard[];
	playerVisibleReserve: SerializedPlacement[];
	computerHand: SerializedCard[];
	computerHiddenReserve: SerializedCard[];
	computerVisibleReserve: SerializedPlacement[];
	gamePhase: GamePhase;
}

// Generate a simple session token
function generateSessionToken(): string {
	const array = new Uint8Array(32);
	crypto.getRandomValues(array);
	return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Parse session cookie
function getSessionFromCookie(request: Request): string | null {
	const cookie = request.headers.get('Cookie');
	if (!cookie) return null;
	const match = cookie.match(/session=([^;]+)/);
	return match ? match[1] : null;
}

// Check if user is authenticated
async function isAuthenticated(request: Request, env: Env): Promise<boolean> {
	const sessionToken = getSessionFromCookie(request);
	if (!sessionToken) return false;

	const session = await env.KV.get(`session:${sessionToken}`);
	return session !== null;
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		console.log(request);

		const url = new URL(request.url);
		const pathname = url.pathname;

		// /login endpoint
		if (pathname === '/login') {
			if (await isAuthenticated(request, env)) {
				return new Response(null, {
					status: 302,
					headers: { 'Location': '/' }
				})
			}

			if (request.method === 'GET') {
				const html = loginPageHtml.replace('{{ERROR_MESSAGE}}', '');
				return new Response(html, {
					headers: { 'Content-Type': 'text/html' }
				});
			}

			if (request.method === 'POST') {
				const formData = await request.formData();
				const username = formData.get('username');
				const password = formData.get('password');

				if (typeof username != "string" || typeof password != "string") {
					const html = loginPageHtml.replace(
						'{{ERROR_MESSAGE}}',
						'<div class="error">Please enter both username and password</div>'
					);
					return new Response(html, {
						status: 400,
						headers: { 'Content-Type': 'text/html' }
					});
				}

				// Get stored password hash for this user
				const storedHash = await env.KV.get(`user:${username}`);

				// Always compute the hash to avoid username existence oracle. Content time enough?
				const salt = storedHash ? bcrypt.getSalt(storedHash) : "$2b$12$8vffttySwDuJ/ZhtNbSV/e";
				const inputHash = bcrypt.hashSync(password, salt);

				if (storedHash !== inputHash) {
					const html = loginPageHtml.replace(
						'{{ERROR_MESSAGE}}',
						'<div class="error">Invalid username or password</div>'
					);
					return new Response(html, {
						status: 401,
						headers: { 'Content-Type': 'text/html' }
					});
				}

				// Create session
				const sessionToken = generateSessionToken();
				await env.KV.put(`session:${sessionToken}`, username, {
					expirationTtl: 60 * 60 * 24 // 24 hours
				});

				// Redirect to home with session cookie
				return new Response(null, {
					status: 302,
					headers: {
						'Location': '/',
						'Set-Cookie': `session=${sessionToken}; HttpOnly; Secure; SameSite=Strict; Max-Age=${60 * 60 * 24}`
					}
				});
			}
		}

		// /logout endpoint
		if (pathname === '/logout') {
			const sessionToken = getSessionFromCookie(request);
			if (sessionToken) {
				await env.KV.delete(`session:${sessionToken}`);
			}
			return new Response(null, {
				status: 302,
				headers: {
					'Location': '/login',
					'Set-Cookie': 'session=; HttpOnly; Secure; SameSite=Strict; Max-Age=0'
				}
			});
		}

		// Protect all other routes - redirect to login if not authenticated
		if (!(await isAuthenticated(request, env))) {
			return new Response(null, {
				status: 302,
				headers: { 'Location': '/login' }
			});
		}

		// All routes are authenticated from here down

		if (pathname === '/game-data') {
			const sessionToken = getSessionFromCookie(request);
			const username = (await env.KV.get(`session:${sessionToken}`))!;

			// Expect to receive a WebSocket Upgrade request.
			// If there is one, accept the request and return a WebSocket Response.
			const upgradeHeader = request.headers.get('Upgrade');
			if (!upgradeHeader || upgradeHeader !== 'websocket') {
				return new Response('Worker expected Upgrade: websocket', {
					status: 426,
				});
			}

			if (request.method !== 'GET') {
				return new Response('Expected GET method', {
					status: 400,
				});
			}

			let id = env.GAME_DATA_SERVER.idFromName('username');
			let gameDataServer = env.GAME_DATA_SERVER.get(id);

			return gameDataServer.fetch(request);
		}

		return env.ASSETS.fetch(request);
	}
};

export class GameDataServer extends DurableObject {
	connected: Boolean = false;
	state: GameState | null = null;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
	}

	async fetch(request: Request): Promise<Response> {
		if (this.connected) return new Response('Already connected', { status: 400 });

		const webSocketPair = new WebSocketPair();
		const [client, server] = Object.values(webSocketPair);

		this.ctx.acceptWebSocket(server);

		return new Response(null, {
			status: 101,
			webSocket: client,
		});
	}

	async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string) {
		const data = JSON.parse(message.toString());

		console.log(`Received message: ${data.type}`);

		switch (data.type) {
			case 'state-get': {
				const state = this.state ?? await this.ctx.storage.get<GameState>('gameState');
				if (state) {
					ws.send(JSON.stringify({ type: 'state-load', state }));
				} else {
					ws.send(JSON.stringify({ type: 'state-none' }));
				}
				break;
			}
			case 'state-update': {
				this.state = data.state;
				await this.ctx.storage.put('gameState', this.state);
				ws.send(JSON.stringify({ type: 'state-saved' }));
				break;
			}
			case 'state-clear': {
				this.state = null;
				await this.ctx.storage.delete('gameState');
				ws.send(JSON.stringify({ type: 'state-cleared' }));
				break;
			}
		}
	}

	async webSocketClose(
		ws: WebSocket,
		code: number,
		reason: string,
		wasClean: boolean,
	) {
		ws.close(code, "Durable Object is closing WebSocket");
	}
}
