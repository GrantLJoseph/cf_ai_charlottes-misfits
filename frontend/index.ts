import { Application, Container, Graphics, Text, TextStyle, FederatedPointerEvent } from 'pixi.js';

// Card data structures
interface Card {
	suit: 'hearts' | 'diamonds' | 'clubs' | 'spades';
	rank: number; // 2-14 (11=Jack, 12=Queen, 13=King, 14=Ace)
	id: string;
	container: Container;
	selected: boolean;
	hovered: boolean;
}

interface Placement {
	cards: Card[];
	type: 'single' | 'multiple' | 'straight';
}

type GamePhase =
	| 'selecting-hidden-reserve'
	| 'selecting-visible-reserve'
	| 'player-turn'
	| 'computer-turn'
	| 'game-over';

// Card configuration
const CARD_WIDTH = 120;
const CARD_HEIGHT = 168;
const CARD_RADIUS = 12;
const CARD_SPACING = 140;
const UNSELECTED_VISIBLE = 0.5;
const SELECTED_RISE = 80;
const HOVER_RISE = 10;

const SUIT_SYMBOLS = {
	hearts: '♥',
	diamonds: '♦',
	clubs: '♣',
	spades: '♠'
};

const SUIT_COLORS = {
	hearts: '#dc2626',
	diamonds: '#dc2626',
	clubs: '#1f2937',
	spades: '#1f2937'
};

function rankToString(rank: number): string {
	if (rank === 14) return 'A';
	if (rank === 13) return 'K';
	if (rank === 12) return 'Q';
	if (rank === 11) return 'J';
	return rank.toString();
}

class CardGame {
	private app: Application;
	private cards: Card[] = [];
	private handContainer: Container;
	private animatingCards: Map<Container, number> = new Map();

	// Game state
	private deck: Card[] = [];
	private stack: Card[] = [];
	private playerHand: Card[] = [];
	private playerHiddenReserve: Card[] = [];
	private playerVisibleReserve: Placement[] = [];
	private computerHand: Card[] = [];
	private computerHiddenReserve: Card[] = [];
	private computerVisibleReserve: Placement[] = [];
	private discardPile: Card[] = [];

	private gamePhase: GamePhase = 'selecting-hidden-reserve';
	private statusText: Text;
	private deckText: Text;
	private stackText: Text;
	private playButton: Container;
	private deckContainer: Container;
	private stackContainer: Container;

	constructor() {
		this.app = new Application();
		this.handContainer = new Container();
		this.statusText = new Text();
		this.deckText = new Text();
		this.stackText = new Text();
		this.playButton = new Container();
		this.deckContainer = new Container();
		this.stackContainer = new Container();
	}

	async init(): Promise<void> {
		await this.app.init({
			background: '#1a472a',
			resizeTo: window,
			antialias: true,
		});

		const container = document.getElementById('game-container');
		if (!container) throw Error('Cannot get game container');
		container.appendChild(this.app.canvas);

		// Don't use handContainer anymore - add all cards directly to stage
		this.app.stage.addChild(this.deckContainer);
		this.app.stage.addChild(this.stackContainer);

		// Create UI elements
		this.createStatusText();
		this.createDeckDisplay();
		this.createStackDisplay();
		this.createPlayButton();

		// Initialize game
		this.initializeDeck();
		this.positionUI();

		// Position all deck cards at deck location
		this.positionDeckCards();

		this.dealInitialCards();

		window.addEventListener('resize', () => {
			this.animatingCards.clear();
			this.positionUI();
			this.positionDeckCards();
			this.positionStackCards();
			this.positionCardsImmediate();
		});
	}

	private createStatusText(): void {
		this.statusText = new Text({
			text: 'Select 3 cards for your hidden reserve (0/3)',
			style: new TextStyle({
				fontFamily: 'Arial, sans-serif',
				fontSize: 24,
				fill: '#ffffff',
				align: 'center'
			})
		});
		this.statusText.anchor.set(0.5, 0);
		this.app.stage.addChild(this.statusText);
		this.positionUI();
	}

	private createDeckDisplay(): void {
		this.deckText = new Text({
			text: 'Deck: 0',
			style: new TextStyle({
				fontFamily: 'Arial, sans-serif',
				fontSize: 20,
				fill: '#ffffff',
				align: 'center'
			})
		});
		this.deckText.anchor.set(0.5, 0);
		this.deckContainer.addChild(this.deckText);
	}

	private createStackDisplay(): void {
		this.stackText = new Text({
			text: 'Stack: 0',
			style: new TextStyle({
				fontFamily: 'Arial, sans-serif',
				fontSize: 20,
				fill: '#ffffff',
				align: 'center'
			})
		});
		this.stackText.anchor.set(0.5, 0);
		this.stackContainer.addChild(this.stackText);

		this.updateStackDisplay();
	}

	private createPlayButton(): void {
		const bg = new Graphics();
		bg.roundRect(0, 0, 200, 50, 8);
		bg.fill({ color: 0x3b82f6 });
		this.playButton.addChild(bg);

		const text = new Text({
			text: 'Play Cards',
			style: new TextStyle({
				fontFamily: 'Arial, sans-serif',
				fontSize: 20,
				fill: '#ffffff'
			})
		});
		text.anchor.set(0.5);
		text.x = 100;
		text.y = 25;
		this.playButton.addChild(text);

		this.playButton.eventMode = 'static';
		this.playButton.cursor = 'pointer';
		this.playButton.visible = false;

		this.playButton.on('pointerdown', () => this.handlePlayButton());

		this.app.stage.addChild(this.playButton);
	}

	private positionUI(): void {
		const screenWidth = this.app.screen.width;
		const screenHeight = this.app.screen.height;

		this.statusText.x = screenWidth / 2;
		this.statusText.y = 20;

		// Position deck on the right side of center
		this.deckContainer.x = screenWidth / 2 + 80;
		this.deckContainer.y = screenHeight / 2 - CARD_HEIGHT / 2;

		// Position stack on the left side of center
		this.stackContainer.x = screenWidth / 2 - CARD_WIDTH - 80;
		this.stackContainer.y = screenHeight / 2 - CARD_HEIGHT / 2;

		this.playButton.x = screenWidth / 2 - 100;
		this.playButton.y = screenHeight / 2 - 200;
	}

	private initializeDeck(): void {
		const suits: Array<'hearts' | 'diamonds' | 'clubs' | 'spades'> = ['hearts', 'diamonds', 'clubs', 'spades'];

		for (const suit of suits) {
			for (let rank = 2; rank <= 14; rank++) {
				const card = this.createCardData(suit, rank, true);
				this.deck.push(card);
				// Add all cards directly to stage
				this.app.stage.addChild(card.container);
			}
		}

		// Shuffle deck
		for (let i = this.deck.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
		}

		this.updateDeckDisplay();
	}

	private createCardData(suit: 'hearts' | 'diamonds' | 'clubs' | 'spades', rank: number, faceDown = false): Card {
		const container = this.createCardContainer(suit, rank, faceDown);
		const card: Card = {
			suit,
			rank,
			id: `${suit}-${rank}-${Math.random()}`,
			container,
			selected: false,
			hovered: false
		};

		container.on('pointerdown', () => this.handleCardClick(card));
		container.on('pointerover', () => this.handleCardHover(card, true));
		container.on('pointerout', () => this.handleCardHover(card, false));

		return card;
	}

	private createCardContainer(suit: 'hearts' | 'diamonds' | 'clubs' | 'spades', rank: number, faceDown = false): Container {
		const container = new Container();
		container.eventMode = 'static';
		container.cursor = 'pointer';

		// Card shadow
		const shadow = new Graphics();
		shadow.roundRect(4, 4, CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS);
		shadow.fill({ color: 0x000000, alpha: 0.2 });
		container.addChild(shadow);

		// Card background - ADD THIS FIRST
		const background = new Graphics();
		background.roundRect(0, 0, CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS);

		if (faceDown) {
			// Face down - blue pattern
			background.fill({ color: 0x1e3a8a });
			background.stroke({ color: 0x1e40af, width: 2 });
			container.addChild(background);

			// Add decorative pattern on top
			const pattern = new Graphics();
			pattern.rect(10, 10, CARD_WIDTH - 20, CARD_HEIGHT - 20);
			pattern.stroke({ color: 0x3b82f6, width: 2 });

			pattern.moveTo(CARD_WIDTH / 2, 10);
			pattern.lineTo(CARD_WIDTH / 2, CARD_HEIGHT - 10);
			pattern.moveTo(10, CARD_HEIGHT / 2);
			pattern.lineTo(CARD_WIDTH - 10, CARD_HEIGHT / 2);
			pattern.stroke({ color: 0x3b82f6, width: 2 });

			container.addChild(pattern);
		} else {
			// Face up - show card details
			background.fill({ color: 0xffffff });
			background.stroke({ color: 0xcccccc, width: 2 });
			container.addChild(background);

			const color = SUIT_COLORS[suit];
			const suitSymbol = SUIT_SYMBOLS[suit];
			const rankStr = rankToString(rank);

			// Top-left rank
			const textStyle = new TextStyle({
				fontFamily: 'Arial, sans-serif',
				fontSize: 28,
				fontWeight: 'bold',
				fill: color,
			});
			const topRank = new Text({ text: rankStr, style: textStyle });
			topRank.x = 10;
			topRank.y = 8;
			container.addChild(topRank);

			// Top-left suit
			const smallSuitStyle = new TextStyle({
				fontFamily: 'Arial, sans-serif',
				fontSize: 20,
				fill: color,
			});
			const topSuit = new Text({ text: suitSymbol, style: smallSuitStyle });
			topSuit.x = 12;
			topSuit.y = 36;
			container.addChild(topSuit);

			// Center suit
			const centerSuitStyle = new TextStyle({
				fontFamily: 'Arial, sans-serif',
				fontSize: 56,
				fill: color,
			});
			const centerSuit = new Text({ text: suitSymbol, style: centerSuitStyle });
			centerSuit.anchor.set(0.5);
			centerSuit.x = CARD_WIDTH / 2;
			centerSuit.y = CARD_HEIGHT / 2;
			container.addChild(centerSuit);

			// Bottom-right rank
			const bottomRank = new Text({ text: rankStr, style: textStyle });
			bottomRank.anchor.set(0, 0);
			bottomRank.x = CARD_WIDTH - 10;
			bottomRank.y = CARD_HEIGHT - 36;
			bottomRank.rotation = Math.PI;
			container.addChild(bottomRank);

			// Bottom-right suit
			const bottomSuit = new Text({ text: suitSymbol, style: smallSuitStyle });
			bottomSuit.anchor.set(0, 0);
			bottomSuit.x = CARD_WIDTH - 12;
			bottomSuit.y = CARD_HEIGHT - 8;
			bottomSuit.rotation = Math.PI;
			container.addChild(bottomSuit);
		}

		return container;
	}

	private dealInitialCards(): void {
		// Deal 9 cards to each player
		for (let i = 0; i < 9; i++) {
			this.playerHand.push(this.deck.pop()!);
			this.computerHand.push(this.deck.pop()!);
		}

		// Sort for display
		this.sortHand(this.playerHand);

		this.displayPlayerHand();
		this.updateDeckDisplay();
	}

	private displayPlayerHand(): void {
		// Cards are already on stage, just position them
		this.positionCards();
	}

	private handleCardClick(card: Card): void {
		if (!this.playerHand.includes(card)) return;

		if (this.gamePhase === 'selecting-hidden-reserve') {
			this.handleHiddenReserveSelection(card);
		} else if (this.gamePhase === 'selecting-visible-reserve') {
			this.handleVisibleReserveSelection(card);
		} else if (this.gamePhase === 'player-turn') {
			this.handlePlayerTurnSelection(card);
		}
	}

	private handleHiddenReserveSelection(card: Card): void {
		card.selected = !card.selected;

		const selectedCount = this.playerHand.filter(c => c.selected).length;

		if (selectedCount === 3) {
			this.playButton.visible = true;
			this.statusText.text = 'Click "Play Cards" to confirm your hidden reserve';
		} else {
			this.playButton.visible = false;
			this.statusText.text = `Select 3 cards for your hidden reserve (${selectedCount}/3)`;
		}

		this.positionCards();
	}

	private handleVisibleReserveSelection(card: Card): void {
		card.selected = !card.selected;
		this.positionCards();

		const selectedCards = this.playerHand.filter(c => c.selected);
		const placement = this.validatePlacement(selectedCards);

		if (placement && this.playerVisibleReserve.length < 3) {
			this.playButton.visible = true;
			this.statusText.text = `Valid placement! Click "Play Cards" to add to visible reserve (${this.playerVisibleReserve.length}/3)`;
		} else if (selectedCards.length > 0) {
			this.playButton.visible = false;
			this.statusText.text = 'Invalid placement - cards must be same kind or a straight of 3+';
		} else {
			this.playButton.visible = false;
			this.statusText.text = `Select cards for visible reserve placement ${this.playerVisibleReserve.length + 1}/3`;
		}
	}

	private handlePlayerTurnSelection(card: Card): void {
		card.selected = !card.selected;
		this.positionCards();

		const selectedCards = this.playerHand.filter(c => c.selected);
		const placement = this.validatePlacement(selectedCards);

		if (placement && this.canPlayOnStack(placement)) {
			this.playButton.visible = true;
			this.statusText.text = 'Valid play! Click "Play Cards" to place on stack';
		} else if (selectedCards.length > 0 && placement) {
			this.playButton.visible = false;
			this.statusText.text = 'Cannot play - cards too low for current stack';
		} else if (selectedCards.length > 0) {
			this.playButton.visible = false;
			this.statusText.text = 'Invalid placement - cards must be same suit or a straight of 3+';
		} else {
			this.playButton.visible = false;
			const pickupOption = this.stack.length > 0 ? ' or click here to pick up stack' : '';
			this.statusText.text = `Your turn - select cards to play${pickupOption}`;
		}
	}

	private handleCardHover(card: Card, isHovering: boolean): void {
		if (!this.playerHand.includes(card)) return;
		card.hovered = isHovering;
		this.positionCards();
	}

	private handlePlayButton(): void {
		if (this.gamePhase === 'selecting-hidden-reserve') {
			this.completeHiddenReserveSelection();
		} else if (this.gamePhase === 'selecting-visible-reserve') {
			this.completeVisibleReservePlacement();
		} else if (this.gamePhase === 'player-turn') {
			this.playSelectedCards();
		}
	}

	private completeHiddenReserveSelection(): void {
		const selected = this.playerHand.filter(c => c.selected);
		if (selected.length !== 3) return;

		// Move selected cards to hidden reserve (keep them face down)
		this.playerHiddenReserve = selected;
		this.playerHand = this.playerHand.filter(c => !c.selected);

		// Flip remaining cards face up so player can see them
		this.playerHand.forEach(card => this.flipCardFaceUp(card));

		// Computer does the same (random selection)
		for (let i = 0; i < 3; i++) {
			const idx = Math.floor(Math.random() * this.computerHand.length);
			this.computerHiddenReserve.push(this.computerHand.splice(idx, 1)[0]);
		}

		this.gamePhase = 'selecting-visible-reserve';
		this.playButton.visible = false;
		this.statusText.text = 'Select cards for visible reserve placement 1/3';
		this.displayPlayerHand();
	}

	private completeVisibleReservePlacement(): void {
		const selected = this.playerHand.filter(c => c.selected);
		const placement = this.validatePlacement(selected);

		if (!placement || this.playerVisibleReserve.length >= 3) return;

		this.playerVisibleReserve.push(placement);
		this.playerHand = this.playerHand.filter(c => !c.selected);

		// Draw back to 3 if needed
		this.drawToMinimum(this.playerHand);

		if (this.playerVisibleReserve.length === 3) {
			// Computer makes its visible reserve
			this.computerMakesVisibleReserve();

			// Start player turn
			this.gamePhase = 'player-turn';
			this.statusText.text = 'Your turn - select cards to play';
		} else {
			this.statusText.text = `Select cards for visible reserve placement ${this.playerVisibleReserve.length + 1}/3`;
		}

		this.playButton.visible = false;
		this.displayPlayerHand();
		this.updateDeckDisplay();
	}

	private playSelectedCards(): void {
		const selected = this.playerHand.filter(c => c.selected);
		const placement = this.validatePlacement(selected);

		if (!placement || !this.canPlayOnStack(placement)) return;

		// Add cards to stack and animate them to stack position
		placement.cards.forEach(card => {
			this.stack.push(card);
			this.animateCard(card.container, this.stackContainer.x, this.stackContainer.y);
			this.flipCardFaceUp(card);
		});
		this.playerHand = this.playerHand.filter(c => !c.selected);

		this.drawToMinimum(this.playerHand);

		// Check for Aces - they clear the stack
		const hasAce = placement.cards.some(c => c.rank === 14);
		if (hasAce) {
			this.discardPile.push(...this.stack);
			this.stack = [];
			this.statusText.text = 'Ace! Stack cleared. Play again!';
			// Player goes again - stay in player-turn phase
		} else {
			// Check if player is out of cards
			if (this.checkWinCondition()) return;

			// Computer's turn
			this.gamePhase = 'computer-turn';
			setTimeout(() => this.computerTurn(), 1000);
		}

		this.playButton.visible = false;
		this.displayPlayerHand();
		this.updateStackDisplay();
		this.updateDeckDisplay();
	}

	private computerMakesVisibleReserve(): void {
		// Stub: computer randomly makes 3 placements
		for (let i = 0; i < 3; i++) {
			if (this.computerHand.length === 0) break;

			// Try to make a valid placement
			const card = this.computerHand.pop()!;
			this.computerVisibleReserve.push({ cards: [card], type: 'single' });

			this.drawToMinimum(this.computerHand);
		}
	}

	private computerTurn(): void {
		// Stub: computer tries to play a random card or picks up stack
		if (this.computerHand.length === 0) {
			// Computer needs to use visible reserve
			if (this.computerVisibleReserve.length > 0) {
				const placement = this.computerVisibleReserve.pop()!;
				this.computerHand.push(...placement.cards);
			} else if (this.computerHiddenReserve.length > 0) {
				// Use hidden reserve
				const card = this.computerHiddenReserve.pop()!;
				const placement = { cards: [card], type: 'single' as const };

				if (this.canPlayOnStack(placement)) {
					this.stack.push(card);
					this.statusText.text = 'Computer played from hidden reserve';
				} else {
					this.computerHand.push(card, ...this.stack);
					this.stack = [];
					this.statusText.text = 'Computer picked up stack';
				}

				this.gamePhase = 'player-turn';
				this.updateStackDisplay();
				return;
			}
		}

		// Try to play any card
		let played = false;
		for (let i = 0; i < this.computerHand.length; i++) {
			const card = this.computerHand[i];
			const placement = { cards: [card], type: 'single' as const };

			if (this.canPlayOnStack(placement)) {
				this.stack.push(card);
				this.computerHand.splice(i, 1);
				played = true;

				// Check for Ace
				if (card.rank === 14) {
					this.discardPile.push(...this.stack);
					this.stack = [];
					// Computer goes again
					setTimeout(() => this.computerTurn(), 1000);
					return;
				}

				break;
			}
		}

		if (!played) {
			// Pick up stack
			this.computerHand.push(...this.stack);
			this.stack = [];
			this.statusText.text = 'Computer picked up the stack';
		} else {
			this.drawToMinimum(this.computerHand);
			this.statusText.text = 'Computer played a card';
		}

		// Check win condition
		if (this.checkWinCondition()) return;

		this.gamePhase = 'player-turn';
		this.updateStackDisplay();
		this.updateDeckDisplay();
	}

	private validatePlacement(cards: Card[]): Placement | null {
		if (cards.length === 0) return null;
		if (cards.length === 1) return { cards, type: 'single' };

		// Check for same rank
		const allSameRank = cards.every(c => c.rank === cards[0].rank);
		if (allSameRank) return { cards, type: 'multiple' };

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
			if (isStraight) return { cards, type: 'straight' };
		}

		return null;
	}

	private canPlayOnStack(placement: Placement): boolean {
		if (this.stack.length === 0) return true;

		const topCard = this.stack[this.stack.length - 1];
		const lowestCard = placement.cards.reduce((min, card) =>
			card.rank < min.rank ? card : min
		);

		// 2s and Aces can always be played
		if (lowestCard.rank === 2 || lowestCard.rank === 14) return true;

		// Otherwise must be >= top card
		return lowestCard.rank >= topCard.rank;
	}

	private drawToMinimum(hand: Card[]): void {
		while (hand.length < 3 && this.deck.length > 0) {
			const card = this.deck.pop()!;

			// If this is the player's hand, flip the card face up
			if (hand === this.playerHand) {
				this.flipCardFaceUp(card);
			}

			hand.push(card);
		}

		this.sortHand(hand);
	}

	private checkWinCondition(): boolean {
		// Check player win
		if (this.playerHand.length === 0 &&
			this.playerVisibleReserve.length === 0 &&
			this.playerHiddenReserve.length === 0) {
			this.gamePhase = 'game-over';
			this.statusText.text = 'You win!';
			return true;
		}

		// Check computer win
		if (this.computerHand.length === 0 &&
			this.computerVisibleReserve.length === 0 &&
			this.computerHiddenReserve.length === 0) {
			this.gamePhase = 'game-over';
			this.statusText.text = 'Computer wins!';
			return true;
		}

		return false;
	}

	private updateDeckDisplay(): void {
		// Clean up placeholder if it exists
		this.deckContainer.removeChildren();
		this.deckContainer.addChild(this.deckText);

		if (this.deck.length === 0) {
			const placeholder = new Graphics();
			placeholder.roundRect(0, 0, CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS);
			placeholder.stroke({ color: 0xffffff, width: 2, alpha: 0.5 });
			this.deckContainer.addChildAt(placeholder, 0);
		}

		this.deckText.text = `${this.deck.length}`;
		this.deckText.y = CARD_HEIGHT + 10;
		this.deckText.x = CARD_WIDTH / 2;
	}

	private updateStackDisplay(): void {
		this.stackContainer.removeChildren();
		this.stackContainer.addChild(this.stackText);

		if (this.stack.length === 0) {
			const placeholder = new Graphics();
			placeholder.roundRect(0, 0, CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS);
			placeholder.stroke({ color: 0xffffff, width: 2, alpha: 0.5 });
			this.stackContainer.addChildAt(placeholder, 0);
		}

		this.stackText.text = `${this.stack.length}`;
		this.stackText.y = CARD_HEIGHT + 10;
		this.stackText.x = CARD_WIDTH / 2;
	}

	private flipCardFaceUp(card: Card): void {
		const oldX = card.container.x;
		const oldY = card.container.y;

		// Remove old container
		this.app.stage.removeChild(card.container);

		// Create new face-up container
		card.container = this.createCardContainer(card.suit, card.rank, false);
		card.container.x = oldX;
		card.container.y = oldY;
		card.container.on('pointerdown', () => this.handleCardClick(card));
		card.container.on('pointerover', () => this.handleCardHover(card, true));
		card.container.on('pointerout', () => this.handleCardHover(card, false));

		// Add back to stage
		this.app.stage.addChild(card.container);
	}

	private flipCardFaceDown(card: Card): void {
		const oldX = card.container.x;
		const oldY = card.container.y;

		// Remove old container
		this.app.stage.removeChild(card.container);

		// Create new face-down container
		card.container = this.createCardContainer(card.suit, card.rank, true);
		card.container.x = oldX;
		card.container.y = oldY;
		card.container.on('pointerdown', () => this.handleCardClick(card));
		card.container.on('pointerover', () => this.handleCardHover(card, true));
		card.container.on('pointerout', () => this.handleCardHover(card, false));

		// Add back to stage
		this.app.stage.addChild(card.container);
	}

	private sortHand(hand: Card[]): void {
		hand.sort((a, b) => {
			if (a.rank === b.rank) return a.suit.localeCompare(b.suit);
			return a.rank - b.rank;
		});
	}

	private positionCards(): void {
		const screenWidth = this.app.screen.width;
		const screenHeight = this.app.screen.height;

		const totalWidth = (this.playerHand.length - 1) * CARD_SPACING + CARD_WIDTH;
		const startX = (screenWidth - totalWidth) / 2;
		const baseY = screenHeight - CARD_HEIGHT * UNSELECTED_VISIBLE;

		this.playerHand.forEach((card, index) => {
			const targetX = startX + index * CARD_SPACING;
			let targetY = baseY;
			if (card.selected) targetY -= SELECTED_RISE;
			else if (card.hovered) targetY -= HOVER_RISE;

			this.animateCard(card.container, targetX, targetY);
		});
	}

	private positionCardsImmediate(): void {
		const screenWidth = this.app.screen.width;
		const screenHeight = this.app.screen.height;

		const totalWidth = (this.playerHand.length - 1) * CARD_SPACING + CARD_WIDTH;
		const startX = (screenWidth - totalWidth) / 2;
		const baseY = screenHeight - CARD_HEIGHT * UNSELECTED_VISIBLE;

		this.playerHand.forEach((card, index) => {
			const targetX = startX + index * CARD_SPACING;
			let targetY = baseY;
			if (card.selected) targetY -= SELECTED_RISE;
			else if (card.hovered) targetY -= HOVER_RISE;

			card.container.x = targetX;
			card.container.y = targetY;
		});

		this.positionUI();
	}

	private animateCard(container: Container, targetX: number, targetY: number): void {
		const existingAnimationId = this.animatingCards.get(container);
		if (existingAnimationId !== undefined) {
			cancelAnimationFrame(existingAnimationId);
		}

		const duration = 150;
		const startX = container.x;
		const startY = container.y;
		const startTime = performance.now();

		const animate = (currentTime: number) => {
			if (!this.animatingCards.has(container)) {
				return;
			}

			const elapsed = currentTime - startTime;
			const progress = Math.min(elapsed / duration, 1);
			const eased = 1 - Math.pow(1 - progress, 3);

			container.x = startX + (targetX - startX) * eased;
			container.y = startY + (targetY - startY) * eased;

			if (progress < 1) {
				const animationId = requestAnimationFrame(animate);
				this.animatingCards.set(container, animationId);
			} else {
				this.animatingCards.delete(container);
			}
		};

		const animationId = requestAnimationFrame(animate);
		this.animatingCards.set(container, animationId);
	}

	private positionDeckCards(): void {
		// Position all cards in the deck at the deck location
		this.deck.forEach(card => {
			card.container.x = this.deckContainer.x;
			card.container.y = this.deckContainer.y;
		});
	}

	private positionStackCards(): void {
		// Position all cards in the stack at the stack location
		this.stack.forEach(card => {
			card.container.x = this.stackContainer.x;
			card.container.y = this.stackContainer.y;
		});
	}
}

const game = new CardGame();
game.init().catch(console.error);
