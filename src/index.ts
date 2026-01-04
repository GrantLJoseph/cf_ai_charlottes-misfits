import bcrypt from "bcryptjs";
import {loginPageHtml} from "./page_templates";

export interface Env {
	KV: KVNamespace;
	SKIP_AUTH: boolean;
	ASSETS: Fetcher;
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

		return env.ASSETS.fetch(request);
	}
};
