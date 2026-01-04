export const loginPageHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Login - Charlotte's Misfits</title>
	<style>
		* { box-sizing: border-box; margin: 0; padding: 0; }
		body {
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
			background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
			min-height: 100vh;
			display: flex;
			align-items: center;
			justify-content: center;
		}
		.login-container {
			background: #ffffff;
			padding: 2.5rem;
			border-radius: 16px;
			box-shadow: 0 10px 25px rgba(0, 0, 0, 0.05);
			width: 100%;
			max-width: 380px;
		}
		h1 {
			color: #1a1a1a;
			text-align: center;
			margin-bottom: 1.5rem;
			font-size: 1.8rem;
		}
		.form-group { margin-bottom: 1.25rem; }
		label {
			display: block;
			color: #4b5563;
			margin-bottom: 0.5rem;
			font-size: 0.9rem;
		}
		input {
			width: 100%;
			padding: 0.75rem 1rem;
			border: 1px solid #d1d5db;
			border-radius: 8px;
			background: #ffffff;
			color: #1f2937;
			font-size: 1rem;
			transition: border-color 0.2s;
		}
		input:focus {
			outline: none;
			border-color: #3b82f6;
		}
		input::placeholder { color: #9ca3af; }
		button {
			width: 100%;
			padding: 0.85rem;
			background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
			border: none;
			border-radius: 8px;
			color: #fff;
			font-size: 1rem;
			font-weight: 600;
			cursor: pointer;
			transition: transform 0.2s, box-shadow 0.2s;
		}
		button:hover {
			transform: translateY(-2px);
			box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
		}
		.error {
			background: #fee2e2;
			border: 1px solid #fecaca;
			color: #dc2626;
			padding: 0.75rem;
			border-radius: 8px;
			margin-bottom: 1rem;
			text-align: center;
			font-size: 0.9rem;
		}
	</style>
</head>
<body>
	<div class="login-container">
		<h1>🃏 Charlotte's Misfits</h1>
		{{ERROR_MESSAGE}}
		<form method="POST" action="/login">
			<div class="form-group">
				<label for="username">Username</label>
				<input type="text" id="username" name="username" placeholder="Enter your username" required>
			</div>
			<div class="form-group">
				<label for="password">Password</label>
				<input type="password" id="password" name="password" placeholder="Enter your password" required>
			</div>
			<button type="submit">Sign In</button>
		</form>
	</div>
</body>
</html>
`;
