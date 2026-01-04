# 1
This is a Cloudflare Workers project. It will be a card game. I want to put it behind a login screen.

Write a simple login screen with username and password fields that authenticates against credentials stored in Workers KV.

# 2
Make the login page light-themed.

# 3
What's the best approach for building a frontend webapp that's an interactive card game?

# 4
I'll implement the backend using an HTTP API. I'm just worried about frontend for now. I want to implement the frontend in typescript, but I've only ever used JavaScript and Rust for frontend. Where does compiling typescript fit into my workflow as it exists now?

# 5
Write a PixiJS "hello world" of sorts that I can use to explore the tech. It should feature a hand of cards at the bottom of the screen hardcoded to 5 arbitrary cards for now. Each card can be selected and deselected individually. A selected card rises up from the bottom. The unselected cards only show about half above the bottom of the screen. The HTML, CSS, and TypeScript should be in separate files.

# 6
Ensure the cards don't overlap with each other in the hand

# 7
Explain the tooling flow of PixiJS. I import a Node module in a TypeScript file that gets converted into JS for the frontend. But then how does the Node module run in the user's browser? The import statement can't run client-side, can it?

# 8
I'm getting a warning from WebStorm that line 41 in frontend/index.ts is doing something that requires ES2015, but a higher version is already set in my tsconfig. I'm assuming a different tsconfig governs the frontend code, but I don't know where it is.
