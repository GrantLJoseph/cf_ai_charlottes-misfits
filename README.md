# Charlotte's Misfits
Carlotte's Misfits is my Cloudflare internship AI project submission. It's a modified version of a card game I was taught by friends over Thanksgiving. The rules are explained via a button on the game's main page.

# How to Start
## Option 1: play online now
Simply go to [https://charlottes-misfits.grantjoseph.workers.dev/](https://charlottes-misfits.grantjoseph.workers.dev/) to play. During the internship period, the login credentials are cloudflare/cloudflare.

## Option 2: host it yourself
After installing NPM, esbuild, and Wrangler, run `npm run dev` to start the server via wrangler.

# AI Features
The computer player's actions are controlled by GPT-OSS 120b. The chat is also connected got GPT-OSS, allowing you to ask for advice or ask questions about the rules of the game. The AI chat can see your hand and the other visible game state on screen.

# Known issues
Vertical displays are not supported. Small displays may not work well. The game was designed around a monitor form factor. Your millage may vary otherwise.
