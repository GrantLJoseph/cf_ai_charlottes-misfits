import bcrypt from 'bcryptjs';
import { DurableObject } from 'cloudflare:workers';
import {loginPageHtml} from './page_templates';

export interface Env {
	AI: Ai;
	ASSETS: Fetcher;
	GAME_DATA_SERVER: DurableObjectNamespace<GameDataServer>;
	KV: KVNamespace;
	SKIP_AUTH: boolean;
}

// Serializable card representation (without PixiJS container)
interface SerializedCard {
	suit: 'hearts' | 'diamonds' | 'clubs' | 'spades';
	rank: number;
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

interface ChatMessage {
	role: 'player' | 'assistant';
	content: string;
}

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
	chatHistory: ChatMessage[];
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

// Check if the user is authenticated
async function isAuthenticated(request: Request, env: Env): Promise<boolean> {
	const sessionToken = getSessionFromCookie(request);
	if (!sessionToken) return false;

	const session = await env.KV.get(`session:${sessionToken}`);
	return session !== null;
}

// Get username from session
async function getUsername(request: Request, env: Env): Promise<string | null> {
	const sessionToken = getSessionFromCookie(request);
	if (!sessionToken) return null;
	return await env.KV.get(`session:${sessionToken}`);
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
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

				if (typeof username != 'string' || typeof password != 'string') {
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
				const salt = storedHash ? bcrypt.getSalt(storedHash) : '$2b$12$8vffttySwDuJ/ZhtNbSV/e';
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

				// Redirect admin to /admin, others to home
				const redirectLocation = username === 'admin' ? '/admin' : '/';
				return new Response(null, {
					status: 302,
					headers: {
						'Location': redirectLocation,
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
		const username = await getUsername(request, env);

		// Admin routes - only accessible by admin user
		if (pathname === '/admin' || pathname.startsWith('/api/admin/')) {
			if (username !== 'admin') {
				return new Response('Forbidden', { status: 403 });
			}

			// Serve admin panel HTML (from static assets)
			if (pathname === '/admin' && request.method === 'GET') {
				return env.ASSETS.fetch(`${url.origin}/admin.html`);
			}

			// API: List all users
			if (pathname === '/api/admin/users' && request.method === 'GET') {
				const users: string[] = [];
				const list = await env.KV.list({ prefix: 'user:' });
				for (const key of list.keys) {
					users.push(key.name.replace('user:', ''));
				}
				return new Response(JSON.stringify({ users }), {
					headers: { 'Content-Type': 'application/json' }
				});
			}

			// API: Add new user
			if (pathname === '/api/admin/users' && request.method === 'POST') {
				const body = await request.json() as { username?: string; password?: string };
				const { username: newUsername, password } = body;

				if (!newUsername || !password) {
					return new Response(JSON.stringify({ error: 'Username and password required' }), {
						status: 400,
						headers: { 'Content-Type': 'application/json' }
					});
				}

				// Check if user already exists
				const existing = await env.KV.get(`user:${newUsername}`);
				if (existing) {
					return new Response(JSON.stringify({ error: 'User already exists' }), {
						status: 409,
						headers: { 'Content-Type': 'application/json' }
					});
				}

				// Hash password and store
				const hash = bcrypt.hashSync(password, 12);
				await env.KV.put(`user:${newUsername}`, hash);

				return new Response(JSON.stringify({ success: true }), {
					headers: { 'Content-Type': 'application/json' }
				});
			}

			// API: Delete user
			if (pathname.startsWith('/api/admin/users/') && request.method === 'DELETE') {
				const userToDelete = decodeURIComponent(pathname.replace('/api/admin/users/', ''));

				if (userToDelete === 'admin') {
					return new Response(JSON.stringify({ error: 'Cannot delete admin user' }), {
						status: 400,
						headers: { 'Content-Type': 'application/json' }
					});
				}

				await env.KV.delete(`user:${userToDelete}`);

				return new Response(JSON.stringify({ success: true }), {
					headers: { 'Content-Type': 'application/json' }
				});
			}
		}

		// Redirect admin to /admin if they try to access the game
		if (pathname === '/' && username === 'admin') {
			return new Response(null, {
				status: 302,
				headers: { 'Location': '/admin' }
			});
		}

		// Establish WebSocket connection for game data
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

			const id = env.GAME_DATA_SERVER.idFromName(`${username}`);
			const gameDataServer = env.GAME_DATA_SERVER.get(id);

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

	async fetch(_request: Request): Promise<Response> {
		if (this.connected) return new Response('Already connected', { status: 400 });

		const webSocketPair = new WebSocketPair();
		const [client, server] = Object.values(webSocketPair);

		this.ctx.acceptWebSocket(server);

		return new Response(null, {
			status: 101,
			webSocket: client,
		});
	}

	private validatePlacement(cards: SerializedCard[]): string {
		if (cards.length === 0) return 'it is empty';
		if (cards.length === 1) return 'valid';

		// Check for same rank
		const allSameRank = cards.every(c => c.rank === cards[0].rank);
		if (allSameRank) return 'valid';

		// Check for straight (3+)
		if (cards.length >= 3) {
			const sorted = [...cards].sort((a, b) => a.rank - b.rank);
			let isStraight = true;
			for (let i = 1; i < sorted.length; i++) {
				if (sorted[i].rank !== sorted[i-1].rank + 1) {
					isStraight = false;
					break;
				}
			}
			if (isStraight) return 'valid';
		}

		return 'is not a straight or multiple of a kind';
	}

	// Validate AI response matches the expected JSON schema exactly
	private validateResponseSchema(response: unknown): string | null {
		// Must be an object
		if (response === null || typeof response !== 'object' || Array.isArray(response)) {
			return 'Response must be an object';
		}

		const obj = response as Record<string, unknown>;
		const allowedKeys = new Set(['action', 'indexes', 'whyMoveIsValid']);

		// Check for extra properties (additionalProperties: false)
		for (const key of Object.keys(obj)) {
			if (!allowedKeys.has(key)) {
				return `Unexpected property: ${key}`;
			}
		}

		// Validate 'action' (required, string, enum)
		if (!('action' in obj)) {
			return 'Missing required property: action';
		}
		if (typeof obj.action !== 'string') {
			return `Property 'action' must be a string, got ${typeof obj.action}`;
		}
		const validActions = ['play', 'stack', 'hidden'];
		if (!validActions.includes(obj.action)) {
			return `Property 'action' must be one of: ${validActions.join(', ')}`;
		}

		// Validate 'whyMoveIsValid' (required, string)
		if (!('whyMoveIsValid' in obj)) {
			return 'Missing required property: whyMoveIsValid';
		}
		if (typeof obj.whyMoveIsValid !== 'string') {
			return `Property 'whyMoveIsValid' must be a string, got ${typeof obj.whyMoveIsValid}`;
		}

		// Validate 'indexes' (optional, array of numbers)
		if ('indexes' in obj) {
			if (!Array.isArray(obj.indexes)) {
				return `Property 'indexes' must be an array, got ${typeof obj.indexes}`;
			}
			for (let i = 0; i < obj.indexes.length; i++) {
				if (typeof obj.indexes[i] !== 'number') {
					return `Property 'indexes[${i}]' must be a number, got ${typeof obj.indexes[i]}`;
				}
			}
		}

		// Action-specific validation
		if (obj.action === 'play') {
			if (!('indexes' in obj) || !Array.isArray(obj.indexes) || obj.indexes.length === 0) {
				return "Action 'play' requires non-empty 'indexes' array";
			}
		}

		if (obj.action === 'hidden') {
			if (!('indexes' in obj) || !Array.isArray(obj.indexes) || obj.indexes.length !== 1) {
				return "Action 'hidden' requires 'indexes' array with exactly one element";
			}
		}

		return null; // Valid
	}

	async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string) {
		if (!this.state) {
			this.state = await this.ctx.storage.get<GameState>('gameState') ?? null;
		}

		const data = JSON.parse(message.toString());

		switch (data.type) {
			case 'state-get': {
				if (this.state) {
					ws.send(JSON.stringify({ type: 'state-load', state: this.state }));
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

			case 'action-req': {
				const MAX_RETRIES = 5;
				let attempts = 0;
				let response: ResponsesOutput;
				let parsedResponse: { action: string; indexes?: number[]; whyMoveIsValid: string } | null = null;
				let lastError = '';

				const instructions = `You are playing a card game called Charlotte's Misfits. You need to win. The rules are as follows: ${RULES}`;

				const input: EasyInputMessage[] = [
					{
						role: 'user',
						content: `Current game state:
- Your hand: ${JSON.stringify(this.state?.computerHand)}
- Your opponent's hand size: ${this.state?.playerHand.length}
- The stack: ${JSON.stringify(this.state?.stack)}
- Your visible reserve: ${JSON.stringify(this.state?.computerVisibleReserve)}
- Your opponent's visible reserve: ${JSON.stringify(this.state?.playerVisibleReserve)}
- Your hidden reserve size: ${this.state?.computerHiddenReserve.length}
- Your opponent's hidden reserve size: ${this.state?.playerHiddenReserve.length}
- Deck size: ${this.state?.deck.length}

To play a card, use the "play" action and include the index(es) of the card(s) in your hand to play, starting at 0. To pick up the stack, use the "stack" action. To pick up a hidden card, use the "hidden" action with an index 0-2.

What is your move?`
					}
				];

				while (attempts++ < MAX_RETRIES) {
					try {
						response = await this.env.AI.run('@cf/openai/gpt-oss-120b', {
							instructions,
							input,
							text: {
								format: {
									type: 'json_schema',
									name: 'game_action',
									strict: true,
									schema: {
										type: 'object',
										properties: {
											action: {
												type: 'string',
												enum: ['play', 'stack', 'hidden'],
											},
											indexes: {
												type: 'array',
												items: {
													type: 'number'
												}
											},
											whyMoveIsValid: {
												type: 'string'
											}
										},
										required: [
											'action',
											'whyMoveIsValid'
										],
										additionalProperties: false
									}
								}
							}
						});

						console.log('HAND', this.state?.computerHand);
						console.log('STACK', this.state?.stack);

						// Extract text from response - output_text should contain the structured JSON
						let outputText = response.output_text;

						// If output_text is empty, try to find structured output in the output array
						if (!outputText && response.output) {
							for (const item of response.output) {
								if (item && typeof item === 'object' && 'content' in item) {
									const msg = item as { content?: Array<{ text?: string; type?: string }> };
									const textContent = msg.content?.find(c => c.type === 'output_text');
									if (textContent?.text) {
										outputText = textContent.text;
										break;
									}
								}
							}
						}

						if (!outputText) {
							lastError = 'No output text received from AI';
							console.error(`Attempt ${attempts}/${MAX_RETRIES}: ${lastError}`);
							continue;
						}

						try {
							parsedResponse = JSON.parse(outputText);
						} catch (e) {
							lastError = `AI returned invalid JSON: ${outputText.substring(0, 100)}`;
							console.error(`Attempt ${attempts}/${MAX_RETRIES}: ${lastError}`);
							continue;
						}

						// Validate the response matches the expected JSON schema
						const schemaError = this.validateResponseSchema(parsedResponse);
						if (schemaError) {
							lastError = `Schema validation failed: ${schemaError}`;
							console.error(`Attempt ${attempts}/${MAX_RETRIES}: ${lastError}`);
							parsedResponse = null;
							continue;
						}

						// Validate the action is legal for current game state
						if (parsedResponse!.action === 'play') {
							const valid = this.validatePlacement(
								this.state?.computerHand.filter((_card, index) => parsedResponse!.indexes?.includes(index)) ?? []
							);

							if (valid === 'valid') {
								break; // Success!
							} else {
								// Add assistant's invalid response, then user feedback
								input.push({
									role: 'assistant',
									content: outputText
								});
								input.push({
									role: 'user',
									content: `That placement is invalid because ${valid}. Try again!`
								});
								lastError = `Invalid placement: ${valid}`;
								console.log(`Attempt ${attempts}/${MAX_RETRIES}: ${lastError}`);
								// Don't continue - let the loop retry with the updated input
							}
						} else if (parsedResponse!.action === 'hidden') {
							if ((this.state?.computerHand.length ?? 0) > 0) {
								// Add assistant's invalid response, then user feedback
								input.push({
									role: 'assistant',
									content: outputText
								});
								input.push({
									role: 'user',
									content: `Drawing from the hidden reserve is invalid because your hand is not empty. Try again!`
								});
								lastError = 'Tried to draw from hidden reserve with cards in hand';
								console.log(`Attempt ${attempts}/${MAX_RETRIES}: ${lastError}`);
							} else {
								break; // Success!
							}
						} else {
							// 'stack' action - always valid
							break; // Success!
						}
					} catch (e) {
						lastError = e instanceof Error ? e.message : 'Unknown error calling AI';
						console.error(`Attempt ${attempts}/${MAX_RETRIES}: AI call failed - ${lastError}`);
						// Continue to retry
					}
				}

				// Check if we got a valid response
				if (!parsedResponse) {
					console.error(`All ${MAX_RETRIES} attempts failed. Last error: ${lastError}`);
					ws.send(JSON.stringify({
						type: 'action-error',
						error: `AI failed after ${MAX_RETRIES} attempts: ${lastError}`
					}));
					break;
				}

				console.log('ACTION ', parsedResponse);
				console.log('==============================');

				ws.send(JSON.stringify({type: 'action-res', action: parsedResponse}));
				break;
			}

			case 'chat-req': {
				const playerMessage = data.message;
				if (!playerMessage || typeof playerMessage !== 'string') {
					ws.send(JSON.stringify({ type: 'chat-res', message: 'Invalid message.' }));
					break;
				}

				// Initialize chat history if needed
				if (this.state && !this.state.chatHistory) {
					this.state.chatHistory = [];
				}

				// Add player message to history
				if (this.state) {
					this.state.chatHistory.push({ role: 'player', content: playerMessage });
				}

				try {
					// Build player-visible state (no computer hand info)
					const visibleState = `Current game state:
- Player's hand: ${JSON.stringify(this.state?.playerHand)}
- Opponent's hand size: ${this.state?.computerHand.length} cards
- The stack: ${JSON.stringify(this.state?.stack)}
- Player's visible reserve: ${JSON.stringify(this.state?.playerVisibleReserve)}
- Opponent's visible reserve: ${JSON.stringify(this.state?.computerVisibleReserve)}
- Player's hidden reserve size: ${this.state?.playerHiddenReserve.length}
- Opponent's hidden reserve size: ${this.state?.computerHiddenReserve.length}
- Game phase: ${this.state?.gamePhase}
- Cards remaining in deck: ${this.state?.deck.length}`;

					console.log(visibleState);

					// Build conversation history for AI
					const chatInput: EasyInputMessage[] = [
						{
							role: 'user',
							content: `${visibleState}\n\n(The game state above will be updated with each message. Previous conversation follows.)`
						}
					];

					// Add chat history to input
					for (const msg of this.state?.chatHistory ?? []) {
						chatInput.push({
							role: msg.role === 'player' ? 'user' : 'assistant',
							content: msg.content
						});
					}

					const response = await this.env.AI.run('@cf/openai/gpt-oss-120b', {
						instructions: `You are a helpful assistant for a card game called Charlotte's Misfits. Your job is to give strategic advice to the player. Be concise but helpful. Strictly limited unnecessary symbols in your output and keep responses breif while remaining helpful. Here are the rules of the game: ${RULES}`,
						input: chatInput
					});

					// Extract the response text
					let responseText = response.output_text;
					if (!responseText && response.output) {
						for (const item of response.output) {
							if (item && typeof item === 'object' && 'content' in item) {
								const msg = item as { content?: Array<{ text?: string; type?: string }> };
								const textContent = msg.content?.find(c => c.type === 'output_text');
								if (textContent?.text) {
									responseText = textContent.text;
									break;
								}
							}
						}
					}

					const assistantMessage = responseText || 'Sorry, I could not generate a response.';

					// Add assistant response to history
					if (this.state) {
						this.state.chatHistory.push({ role: 'assistant', content: assistantMessage });
						await this.ctx.storage.put('gameState', this.state);
					}

					ws.send(JSON.stringify({
						type: 'chat-res',
						message: assistantMessage
					}));
				} catch (e) {
					console.error('Chat AI error:', e);
					const errorMessage = 'Sorry, I encountered an error while thinking about your question.';

					// Still save the player message even if AI fails
					if (this.state) {
						await this.ctx.storage.put('gameState', this.state);
					}

					ws.send(JSON.stringify({
						type: 'chat-res',
						message: errorMessage
					}));
				}
				break;
			}
		}
	}

	async webSocketClose(
		ws: WebSocket,
		code: number,
	) {
		ws.close(code, 'Durable Object is closing WebSocket');
	}
}

const RULES: string = `
Each player has a hand. In the center of the table are the deck and the stack. Each player must maintain at least three cards in their hand at all times, drawing from the deck whenever their hand drops below 3 cards, unless the desk is empty.

A placement is 1 or more cards. Cards of the same rank can be placed together. A straight of three or more consecutive cards can be placed together. Straights and multiple of a kind cannot be combined in the same placement.

At the start of the game, each player draws 9 cards into their hand face down. Each player selects three cards to place face down, without ever getting to see them. These three cards per player are known as that player's hidden reserve.

Each player then looks at their remaining 6 cards and makes three placements. These three placements are their visible reserve. Since each placement can include multiple of a kind or a straight, the player may need to draw from the deck to replenish their hand as they go.

Once the visible reserves are populated and all players have 3 cards in their hand, turns begin.

On their turn, a player attempts to make a placement onto the stack next to the deck. If the stack is empty, any placement is valid. Otherwise, the lowest card of the placement must be at least as high as the rank of the card on top of the stack.

Examples:

The top of the stack is a 5. The player can play a 5 or higher.
The top of the stack is a 7. The player can play 3 10s, as they are all the same kind.
The top of the stack is a Jack. The player can play a Jack, Queen, King straight, but not a 10, Jack, Queen straight because 10 is not at least as high as Jack.
Cards of rank 2 are the exception. A card of rank 2 can always be played, serving as something akin to a wild card. As a consequence, a straight starting with a 2 can also always be played.

Aces are also special. Aces can always be played by virtue of being the highest card. They also trigger special behavior; playing an Ace discards everything on the stack from play for the entire rest of the game, permanently shrinking the number of cards in play and making the stack empty. The player also gets to go again, making a second placement. This can be chained, for example allowing players to play 2 Aces and then a third placement all in one turn, so long as it happens in that order.

If a player is unable to make a placement onto the stack, they must take the contents of the stack into their hand.

When the deck is empty, players are unable to draw cards after placing to refill their hand. When their hand is completely empty, the player takes their entire visible reserve into their hand.

When their hand is empty and their visible reserve is gone, the player's turn consists of choosing one card from their hidden reserve to attempt to place. If the one card revealed is illegal to place, the player must take the stack into their hand.

The first player to run out of cards completely, exhausting the deck, and both of their reserves, wins.

# REMINDERS
Multiple cards can **only** be played together if they're consecutive in rank or of the same kind.

Lower cards are harder to get rid of, so try to play them early. 2 is the exception, since it can always be played.

You CANNOT pick up or play ANYTHING EVER from your visible reserves directly. Once your hand is empty, your visible reserve cards will be drawn into your hand and then they can be played.

You can "spike" the player by playing a high card. This can be especially effective when the stack has many cards. Sometimes holding onto a high card for the right moment is a good strategy.

If the player's hand is low, spiking is often a good idea to keep them from drawing their reserves. If the player's hand is empty and they're using their hidden reserves, it's especially important.
`
