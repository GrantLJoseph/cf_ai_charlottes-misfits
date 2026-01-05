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

# 9
The current frontend/index.ts file implements basic card hand and card animation mechanics. Now it's time to implement the proper card game itself. Implement it from the perspective of a two-player game. It's not multiplayer yet. The player plays against the computer. The computer's decisions should be stubbed to random choices for now. That's not important yet. The rules are as follows:

Each player has a **hand**. In the center of the table are the **deck** and the **stack**. Each player *must* maintain at least three cards in their hand at all times, drawing from the deck whenever their hand drops below 3 cards, unless the desk is empty.

A **placement** is 1 or more cards. Cards of the same suit can be placed together. A straight of three or more cards can be placed together. Straights and multiple of a kind cannot be combined in the same placement.

At the start of the game, each player draws 9 cards into their hand face down. Each player selects three cards to place face down, without ever getting to see them. These three cards per player are known as that player's **hidden reserve**.

Each player then looks at their remaining 6 cards and makes three placements. These three placements are their **visible reserve**. Since each placement can include multiple of a kind or a straight, the player may need to draw from the deck to replenish their hand as they go.

Once the visible reserves are populated and all players have 3 cards in their hand, turns begin. For this single-human version, the user always goes first.

On their turn, a player attempts to make a placement onto the stack next to the deck. If the stack is empty, any placement is valid. Otherwise, the lowest card of the placement must be at least as high as the rank of the card on top of the stack.

Examples:
1. The top of the stack is a 5. The player can play a 5 or higher.
2. The top of the stack is a 7. The player can play 3 10s.
3. The top of the stack is a Jack. The player can play a Jack, Queen, King straight, but not a 10, Jack, Queen straight because 10 is not at least as high as Jack.

Cards of rank 2 are the exception. A card of rank 2 can always be played, serving as something akin to a wild card. As a consequence, a straight starting with a 2 can also always be played.

Aces are also special. Aces can always be played by virtue of being the highest card. They also trigger special behavior; playing an Ace discards everything on the stack from play for the entire rest of the game, permanently shrinking the number of cards in play and making the stack empty. The player also gets to go again, making a second placement. This can be chained, for example allowing players to play 2 Aces and then a third placement all in one turn, so long as it happens in that order.

If a player is unable to make a placement onto the stack, they **must** take the contents of the stack into their hand.

When the deck is empty, players are unable to draw cards after placing to refill their hand. When their hand is completely empty, the player takes their entire visible reserve into their hand.

When their hand is empty and their visible reserve is gone, the player's turn consists of choosing one card from their hidden reserve to attempt to place. If the one card revealed is illegal to place, the player must take the stack into their hand.

The first player to run out of cards completely, exhausting the deck, and both of their reserves, wins.

# 10
I made some changes, so make sure you don't override them. The hidden reserves should be picked face down, not visible to the user as they choose.

# 11
The cards are now blank when face up. It seems like maybe the card decorations are being drawn in the wrong place, but that's just a hunch.

# 12
That worked. Now cards drawn by the player are left face down in their hand though.

# 13
Make the deck and stack physically visible in the center of the game screen. The deck should be on the right, symbolized by a face-down card with the size of the deck displayed beneath it. The stack should be to the left, showing the card currently on top with its total size beneath it as well.

There should be a white rectangle the size of a card shown where the deck/stack should be when they're empty as an additional indicator in addition to the size being listed as zero.

# 14
Neither the bottom right suit nor rank are correctly positioned. The rank is too far to the right and probably also too far down. The suit is both, being positioned off the bottom right corner of the card.

# 15
The cards in the deck should actually be physically located in the deck display on screen. This should result in cards moving from the physical deck into the player's hand instead of coming from offscreen. No more artifical card back to represent the deck.

# 16
When the hand is too large to fit on screen, make it scrollable horizontally so no cards are unreachable. When there are cards off-screen on the left or right side respectively, there should be an arrow on that side pointing off-screen. Hovering over that arrow scrolls the hand cards in that direction.

# 17
The scroll arrows aren't working properly. The arrows don't keep scrolling when the arrow is continuously hovered. Other aspects may be broken as well.

# 18
At least the left scroll arrow appears when there isn't anything to scroll to. It may be appearing on the wrong side releative to where the overflowed cards are.Also, once the scrolling has finished to the left, there is no arrow to go back to the right to see those overflowed cards.

# 19
That's closer. When I scroll to the right, it stops letting me scroll while the farthest right card is still mostly off screen. It should let me keep scrolling until the farthest right or left card is fully on-screen. Also, once I scrolled to the right, it didn't let me scroll back to the left. Once the user scrolls in one direction, they categorically should be able to scroll back in the other direction.

# 20
It's very close now. It just still sometimes gets stuck where scrolling is disabled before the last card in that direction is fully visible.

# 21
Make sure you are familiar with the game rules in rules.md. Currently, the player's hidden and visible reserves just disappear when selected. Instead, the player's reserves should exist on the game board to the right of the stack and the deck. The computer's reserves should exist to the left of the stack and deck.

When the player selects their 3 hidden reserve cards, those cards should move to a horizontal row on the right side, staying face down. Each of the three visible reserve placements should be placed on top of one of these three hidden reserve cards (one placement per hidden reserve card). Since visible reserve placements can contain more than one card apiece, the cards within the placement should be stacked on top of each other downward. Each card except for the top, lowermost card should have just enough showing to see the suit and rank in the upper left corner of the card.

The computer's reserves should be essentially the same and not rotated away from the player.
