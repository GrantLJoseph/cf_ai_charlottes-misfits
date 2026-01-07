import { Application, Container, Graphics, Text, TextStyle, Rectangle } from 'pixi.js';
import Chat from './chat';

// Serializable card representation (without PixiJS container)
interface SerializedCard {
	suit: 'hearts' | 'diamonds' | 'clubs' | 'spades';
	rank: number;
}

interface SerializedPlacement {
	cards: SerializedCard[];
	type: 'single' | 'multiple' | 'straight';
}

interface ChatMessage {
	role: 'player' | 'assistant';
	content: string;
}

// Complete game state for server sync
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
	chatHistory?: ChatMessage[];
}

// Card data structures
interface Card {
	suit: 'hearts' | 'diamonds' | 'clubs' | 'spades';
	rank: number; // 2-14 (11=Jack, 12=Queen, 13=King, 14=Ace)
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
const COMPUTER_HAND_VISIBLE = 0.2;
const SELECTED_RISE = 80;
const HOVER_RISE = 10;

// Reserve display configuration
const RESERVE_SPACING = CARD_WIDTH + 20; // Horizontal spacing between reserve piles
const RESERVE_CARD_PEEK = 60; // How much of each stacked card shows (enough for rank/suit)

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

// Received from AI WS
interface Action {
	action: 'play' | 'stack' | 'hidden';
	indexes: number[] | null;
}

class CardGame {
	private app: Application;
	private animatingCards: Map<Container, number> = new Map();
	private chat: Chat;

	private socket: WebSocket;

	// Game state
	private deck: Card[] = [];
	private stack: Card[] = [];
	private playerHand: Card[] = [];
	private playerHiddenReserve: Card[] = [];
	private playerVisibleReserve: Placement[] = [];
	private computerHand: Card[] = [];
	private computerHiddenReserve: Card[] = [];
	private computerVisibleReserve: Placement[] = [];

	private gamePhase: GamePhase = 'selecting-hidden-reserve';
	private statusText: Text;
	private deckText: Text;
	private stackText: Text;
	private playButton: Container;
	private deckContainer: Container;
	private stackContainer: Container;

	// Reserve containers for positioning reference
	private playerReserveBaseX: number = 0;
	private playerReserveBaseY: number = 0;
	private computerReserveBaseX: number = 0;
	private computerReserveBaseY: number = 0;

	private scrollInterval: number | null = null;
	private handScrollOffset: number = 0;
	private leftScrollArrow: Container;
	private rightScrollArrow: Container;

	constructor() {
		this.app = new Application();
		this.statusText = new Text();
		this.deckText = new Text();
		this.stackText = new Text();
		this.playButton = new Container();
		this.deckContainer = new Container();
		this.stackContainer = new Container();
		this.leftScrollArrow = new Container();
		this.rightScrollArrow = new Container();
		this.socket = new WebSocket("/game-data");
		this.chat = new Chat((message) => this.sendChatMessage(message));
	}

	private sendChatMessage(message: string): void {
		if (this.socket.readyState === WebSocket.OPEN) {
			this.socket.send(JSON.stringify({ type: 'chat-req', message }));
		}
	}

	async init(): Promise<void> {
		const container = document.getElementById('game-container');
		if (!container) throw Error('Cannot get game container');

		await this.app.init({
			background: '#1a472a',
			resizeTo: container,
			antialias: true,
		});

		// Limit event detection to canvas bounds
		this.app.stage.eventMode = 'static';
		this.app.stage.hitArea = new Rectangle(0, 0, this.app.screen.width, this.app.screen.height);

		container.appendChild(this.app.canvas);

		this.app.stage.addChild(this.deckContainer);
		this.app.stage.addChild(this.stackContainer);

		// Create UI elements
		this.createStatusText();
		this.createDeckDisplay();
		this.createStackDisplay();
		this.createPlayButton();
		this.createScrollArrows();

		this.positionUI();

		// Connect to server - game initialization happens in handleSocketMessage
		this.socket.addEventListener("open", () => this.handleSocketOpen());
		this.socket.addEventListener("message", (event) => this.handleSocketMessage(event));

		// Reset button
		const resetButton = document.getElementById('reset-game');
		if (resetButton) {
			resetButton.addEventListener('click', () => this.resetGame());
		}

		// Rules popup
		const rulesToggle = document.getElementById('rules-toggle');
		const rulesPopup = document.getElementById('rules-popup');
		const rulesClose = document.getElementById('rules-close');
		const rulesBackdrop = document.getElementById('rules-backdrop');

		if (rulesToggle && rulesPopup && rulesClose && rulesBackdrop) {
			const openRules = () => {
				rulesPopup.classList.remove('rules-hidden');
				rulesBackdrop.classList.add('visible');
			};
			const closeRules = () => {
				rulesPopup.classList.add('rules-hidden');
				rulesBackdrop.classList.remove('visible');
			};

			rulesToggle.addEventListener('click', openRules);
			rulesClose.addEventListener('click', closeRules);
			rulesBackdrop.addEventListener('click', closeRules);

			// Close on Escape key
			document.addEventListener('keydown', (e) => {
				if (e.key === 'Escape' && !rulesPopup.classList.contains('rules-hidden')) {
					closeRules();
				}
			});
		}
	}

	private resetGame(): void {
		if (!confirm('Are you sure you want to reset the game? All progress will be lost.')) {
			return;
		}

		// Destroy all card containers
		const allCards = [
			...this.deck,
			...this.stack,
			...this.playerHand,
			...this.playerHiddenReserve,
			...this.playerVisibleReserve.flatMap(p => p.cards),
			...this.computerHand,
			...this.computerHiddenReserve,
			...this.computerVisibleReserve.flatMap(p => p.cards)
		];
		allCards.forEach(card => card.container.destroy());

		// Clear all arrays
		this.deck = [];
		this.stack = [];
		this.playerHand = [];
		this.playerHiddenReserve = [];
		this.playerVisibleReserve = [];
		this.computerHand = [];
		this.computerHiddenReserve = [];
		this.computerVisibleReserve = [];
		this.handScrollOffset = 0;

		// Clear chat
		this.chat.clear();

		// Clear server state
		this.clearGameState();

		// Start fresh
		this.startNewGame();
		this.chat.addMessage('Game has been reset. Good luck!');
	}

	private handleSocketOpen(): void {
		this.socket.send(JSON.stringify({ type: 'state-get' }));
	}

	private handleSocketMessage(event: MessageEvent): void {
		const data = JSON.parse(event.data);

		switch (data.type) {
			case 'state-load':
				this.loadGameState(data.state);
				this.setupResizeHandler();
				// Only show restore message if no chat history was loaded
				if (!data.state.chatHistory || data.state.chatHistory.length === 0) {
					this.chat.addMessage('Game restored from previous session.');
				}
				break;
			case 'state-none':
				this.startNewGame();
				this.setupResizeHandler();
				this.chat.addMessage('Hello, World! Welcome to the card game.');
				break;
			case 'state-saved':
				console.log('Game state saved to server');

				if (this.gamePhase === 'computer-turn')
					this.socket.send(JSON.stringify({ type: 'action-req' }));

				break;
			case 'state-cleared':
				console.log('Game state cleared from server');
				break;

			case 'action-res':
				this.computerTurn(data.action);
				break;

			case 'action-error':
				console.error('AI error:', data.error);
				this.chat.addMessage(`Computer encountered an error: ${data.error}`, 'system');
				// Fall back to computer picking up the stack
				this.takeStack(this.computerHand);
				this.updateStatus('Computer had trouble thinking and picked up the stack', true);
				this.updateStackDisplay();
				this.positionCards();
				this.startPlayerTurn();
				this.saveGameState();
				break;

			case 'chat-res':
				this.chat.addMessage(data.message, 'system');
				break;
		}
	}

	private setupResizeHandler(): void {
		window.addEventListener('resize', () => {
			this.animatingCards.clear();
			// Update hitArea to match new canvas size
			this.app.stage.hitArea = new Rectangle(0, 0, this.app.screen.width, this.app.screen.height);
			this.positionUI();
			this.positionDeckCards();
			this.positionStackCards();
			this.positionReserveCards(true);
			this.positionCards(true);
		});
	}

	// Serialize a card for storage (strip PixiJS container)
	private serializeCard(card: Card): SerializedCard {
		return {
			suit: card.suit,
			rank: card.rank,
		};
	}

	// Serialize a placement
	private serializePlacement(placement: Placement): SerializedPlacement {
		return {
			cards: placement.cards.map(c => this.serializeCard(c)),
			type: placement.type
		};
	}

	// Get the current game state for saving
	private getGameState(): GameState {
		return {
			deck: this.deck.map(c => this.serializeCard(c)),
			stack: this.stack.map(c => this.serializeCard(c)),
			playerHand: this.playerHand.map(c => this.serializeCard(c)),
			playerHiddenReserve: this.playerHiddenReserve.map(c => this.serializeCard(c)),
			playerVisibleReserve: this.playerVisibleReserve.map(p => this.serializePlacement(p)),
			computerHand: this.computerHand.map(c => this.serializeCard(c)),
			computerHiddenReserve: this.computerHiddenReserve.map(c => this.serializeCard(c)),
			computerVisibleReserve: this.computerVisibleReserve.map(p => this.serializePlacement(p)),
			gamePhase: this.gamePhase
		};
	}

	// Save current state to server
	private saveGameState(): void {
		if (this.socket.readyState === WebSocket.OPEN) {
			const state = this.getGameState();
			this.socket.send(JSON.stringify({ type: 'state-update', state }));
		}
	}

	// Clear state on server (called when game ends)
	private clearGameState(): void {
		if (this.socket.readyState === WebSocket.OPEN) {
			this.socket.send(JSON.stringify({ type: 'state-clear' }));
		}
	}

	// Rebuild a placement from serialized data
	private deserializePlacement(serialized: SerializedPlacement, faceDown: boolean): Placement {
		return {
			cards: serialized.cards.map(c => {
				const card = this.createCard(c.suit, c.rank, faceDown);
				this.app.stage.addChild(card.container);
				return card;
			}),
			type: serialized.type
		};
	}

	private rankToString(rank: number): string {
		if (rank === 14) return 'A';
		if (rank === 13) return 'K';
		if (rank === 12) return 'Q';
		if (rank === 11) return 'J';
		return rank.toString();
	}

	private rankToFullString(rank: number): string {
		if (rank === 14) return 'Ace';
		if (rank === 13) return 'King';
		if (rank === 12) return 'Queen';
		if (rank === 11) return 'Jack';
		return rank.toString();
	}

	private formatCard(card: { suit: string; rank: number }): string {
		return `${this.rankToFullString(card.rank)} of ${card.suit}`;
	}

	private formatCards(cards: Array<{ suit: string; rank: number }>): string {
		if (cards.length === 0) return 'nothing';
		if (cards.length === 1) return this.formatCard(cards[0]);
		if (cards.length === 2) return `${this.formatCard(cards[0])} and ${this.formatCard(cards[1])}`;
		const last = cards[cards.length - 1];
		const rest = cards.slice(0, -1).map(this.formatCard).join(', ');
		return `${rest}, and ${this.formatCard(last)}`;
	}

	// Load game state from server
	private loadGameState(state: GameState): void {
		// Helper to create card and add to stage
		const createAndAddCard = (c: SerializedCard, faceDown: boolean): Card => {
			const card = this.createCard(c.suit, c.rank, faceDown);
			this.app.stage.addChild(card.container);
			return card;
		};

		// Rebuild cards from state
		// Deck cards are always face down
		this.deck = state.deck.map(c => createAndAddCard(c, true));

		// Stack cards are always face up
		this.stack = state.stack.map(c => createAndAddCard(c, false));

		// Player hand is face up (after initial selection phase)
		const playerHandFaceDown = state.gamePhase === 'selecting-hidden-reserve';
		this.playerHand = state.playerHand.map(c => createAndAddCard(c, playerHandFaceDown));

		// Player hidden reserve is face down
		this.playerHiddenReserve = state.playerHiddenReserve.map(c => createAndAddCard(c, true));

		// Player visible reserve is face up
		this.playerVisibleReserve = state.playerVisibleReserve.map(p => this.deserializePlacement(p, false));

		// Computer hand is always face down from player's perspective
		this.computerHand = state.computerHand.map(c => createAndAddCard(c, true));

		// Computer hidden reserve is face down
		this.computerHiddenReserve = state.computerHiddenReserve.map(c => createAndAddCard(c, true));

		// Computer visible reserve is face up
		this.computerVisibleReserve = state.computerVisibleReserve.map(p => this.deserializePlacement(p, false));

		// Restore game phase
		this.gamePhase = state.gamePhase;

		// Update UI based on phase
		this.updateUIForPhase();

		if (this.gamePhase === 'computer-turn')
			this.startComputerTurn();

		// Position everything
		this.positionDeckCards();
		this.positionStackCards();
		this.positionCards();
		this.positionReserveCards();
		this.updateDeckDisplay();
		this.updateStackDisplay();

		// Restore chat history
		if (state.chatHistory) {
			for (const msg of state.chatHistory) {
				this.chat.addMessage(msg.content, msg.role === 'player' ? 'player' : 'system');
			}
		}
	}

	// Update UI elements based on current game phase
	private updateUIForPhase(): void {
		this.playButton.visible = false;

		switch (this.gamePhase) {
			case 'selecting-hidden-reserve':
				this.updateStatus('Select 3 cards for your hidden reserve (0/3)', false);
				break;
			case 'selecting-visible-reserve':
				this.updateStatus(`Select cards for visible reserve placement ${this.playerVisibleReserve.length + 1}/3`, false);
				break;
			case 'player-turn':
				if (this.playerHand.length > 0)
					this.updateStatus('Your turn - select cards to play', false);
				else
					this.updateStatus('Your turn - select a hidden reserve card', false);
				break;
			case 'computer-turn':
				this.updateStatus('Computer is thinking...', false);
				break;
			case 'game-over':
				// Don't change status, it should already show win/lose
				break;
		}
	}

	private startNewGame(): void {
		// Initialize deck only for new games
		this.initializeDeck();
		this.positionDeckCards();
		this.dealInitialCards();
		this.updateDeckDisplay();

		// Computer makes hidden reserve selection first
		for (let i = 0; i < 3; i++) {
			const card = this.computerHand.pop()!;
			this.computerHiddenReserve.push(card);
		}

		this.positionCards();
		this.positionReserveCards();
	}

	private updateStatus(text: string, logToChat: boolean): void {
		if (logToChat && text != this.statusText.text) {
			this.chat.addMessage(text, 'system');
		}

		this.statusText.text = text;
	}

	private createScrollArrows(): void {
		// Left arrow
		const leftArrowGraphic = new Graphics();
		leftArrowGraphic.moveTo(30, 0);
		leftArrowGraphic.lineTo(0, 30);
		leftArrowGraphic.lineTo(30, 60);
		leftArrowGraphic.fill({ color: 0x87ceeb, alpha: 1 });
		this.leftScrollArrow.addChild(leftArrowGraphic);
		this.leftScrollArrow.eventMode = 'static';
		this.leftScrollArrow.cursor = 'pointer';
		this.leftScrollArrow.visible = false;

		// Make sure it's on top of cards
		this.leftScrollArrow.zIndex = 100;

		this.leftScrollArrow.on('pointerover', () => {
			this.startScrolling(1);
		});
		this.leftScrollArrow.on('pointerout', () => {
			this.stopScrolling();
		});

		// Right arrow
		const rightArrowGraphic = new Graphics();
		rightArrowGraphic.moveTo(0, 0);
		rightArrowGraphic.lineTo(30, 30);
		rightArrowGraphic.lineTo(0, 60);
		rightArrowGraphic.fill({ color: 0x87ceeb, alpha: 1 });
		this.rightScrollArrow.addChild(rightArrowGraphic);
		this.rightScrollArrow.eventMode = 'static';
		this.rightScrollArrow.cursor = 'pointer';
		this.rightScrollArrow.visible = false;

		// Make sure it's on top of cards
		this.rightScrollArrow.zIndex = 100;

		this.rightScrollArrow.on('pointerover', () => {
			this.startScrolling(-1);
		});
		this.rightScrollArrow.on('pointerout', () => {
			this.stopScrolling();
		});

		this.app.stage.addChild(this.leftScrollArrow);
		this.app.stage.addChild(this.rightScrollArrow);
	}


	private startScrolling(direction: number): void {
		if (this.scrollInterval !== null) return;

		this.scrollInterval = window.setInterval(() => {
			const screenWidth = this.app.screen.width;
			const totalWidth = (this.playerHand.length - 1) * CARD_SPACING + CARD_WIDTH;

			// Calculate scroll bounds:
			// maxScrollOffset = 0: leftmost card fully visible at left edge
			// minScrollOffset: rightmost card fully visible at right edge
			const maxScrollOffset = 0;
			const minScrollOffset = screenWidth - totalWidth;

			// Apply scroll with bounds checking
			const newOffset = this.handScrollOffset + direction * 10;
			this.handScrollOffset = Math.max(minScrollOffset, Math.min(maxScrollOffset, newOffset));

			this.positionCards();
			this.updateScrollArrows();
		}, 16); // ~60fps
	}

	private stopScrolling(): void {
		if (this.scrollInterval !== null) {
			clearInterval(this.scrollInterval);
			this.scrollInterval = null;
		}
	}

	private updateScrollArrows(): void {
		const screenWidth = this.app.screen.width;
		const screenHeight = this.app.screen.height;

		if (this.playerHand.length === 0) {
			this.leftScrollArrow.visible = false;
			this.rightScrollArrow.visible = false;
			return;
		}

		// Calculate total width and bounds
		const totalWidth = (this.playerHand.length - 1) * CARD_SPACING + CARD_WIDTH;

		// If cards fit on screen, don't show arrows
		if (totalWidth <= screenWidth) {
			this.leftScrollArrow.visible = false;
			this.rightScrollArrow.visible = false;
			return;
		}

		// Calculate scroll bounds:
		// maxScrollOffset = 0: leftmost card fully visible at left edge
		// minScrollOffset: rightmost card fully visible at right edge
		const maxScrollOffset = 0;
		const minScrollOffset = screenWidth - totalWidth;

		// Show left arrow if we can scroll left (offset can increase toward 0)
		const canScrollLeft = this.handScrollOffset < maxScrollOffset - 1;
		if (this.leftScrollArrow.visible && !canScrollLeft) {
			this.stopScrolling();
		}
		this.leftScrollArrow.visible = canScrollLeft;
		this.leftScrollArrow.x = 20;
		this.leftScrollArrow.y = screenHeight - CARD_HEIGHT * UNSELECTED_VISIBLE / 2 - this.leftScrollArrow.height / 2;

		// Show right arrow if we can scroll right (offset can decrease toward min)
		const canScrollRight = this.handScrollOffset > minScrollOffset + 1;
		if (this.rightScrollArrow.visible && !canScrollRight) {
			this.stopScrolling();
		}
		this.rightScrollArrow.visible = canScrollRight;
		this.rightScrollArrow.x = screenWidth - 50;
		this.rightScrollArrow.y = screenHeight - CARD_HEIGHT * UNSELECTED_VISIBLE / 2 - this.rightScrollArrow.height / 2;
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
		this.statusText.y = screenHeight * 0.1;

		// Position deck on the right side of center
		this.deckContainer.x = screenWidth / 2 + 80;
		this.deckContainer.y = screenHeight / 2 - CARD_HEIGHT / 2;

		// Position stack on the left side of center
		this.stackContainer.x = screenWidth / 2 - CARD_WIDTH - 80;
		this.stackContainer.y = screenHeight / 2 - CARD_HEIGHT / 2;

		this.playButton.x = screenWidth / 2 - 100;
		this.playButton.y = screenHeight / 2 + 200;

		// Player reserves: to the right of the deck
		const rightGapSize = screenWidth - (this.deckContainer.x + CARD_WIDTH);

		this.playerReserveBaseX = this.deckContainer.x + CARD_WIDTH + (rightGapSize - (3 * CARD_WIDTH + 40)) / 2;
		this.playerReserveBaseY = this.deckContainer.y;

		// Computer reserves: to the left of the stack
		const leftGapSize = this.stackContainer.x;

		this.computerReserveBaseX = (leftGapSize - (3 * CARD_WIDTH + 40)) / 2;
		this.computerReserveBaseY = this.stackContainer.y;

		// Reposition reserve cards when UI changes
		this.positionReserveCards();
	}

	private initializeDeck(): void {
		const suits: Array<'hearts' | 'diamonds' | 'clubs' | 'spades'> = ['hearts', 'diamonds', 'clubs', 'spades'];

		for (const suit of suits) {
			for (let rank = 2; rank <= 14; rank++) {
				const card = this.createCard(suit, rank, true);
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
	}

	private createCard(suit: 'hearts' | 'diamonds' | 'clubs' | 'spades', rank: number, faceDown = false): Card {
		const container = this.createCardContainer(suit, rank, faceDown);
		const card: Card = {
			suit,
			rank,
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
			const rankStr = this.rankToString(rank);

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
	}

	private handleCardClick(card: Card): void {
		if (this.playerHand.includes(card)) {
			if (this.gamePhase === 'selecting-hidden-reserve') {
				this.handleHiddenReserveSelection(card);
			} else if (this.gamePhase === 'selecting-visible-reserve') {
				this.handleVisibleReserveSelection(card);
			} else if (this.gamePhase === 'player-turn') {
				this.handlePlayerTurnSelection(card);
			}
		} else if (this.gamePhase === 'player-turn') {
			// Taking stack
			if (card === this.stack[this.stack.length - 1]) {
				const stackSize = this.stack.length;
				this.takeStack(this.playerHand);
				this.updateStatus(`You picked up the stack (${stackSize} cards)`, true);

				this.updateStackDisplay();
				this.positionCards();

				// startComputerTurn() calls saveGameState() which triggers action-req
				this.startComputerTurn();
			// Drawing from hidden reserve
			} else if (this.playerHand.length == 0 && this.deck.length == 0 && this.playerVisibleReserve.length == 0 && this.playerHiddenReserve.includes(card)) {
				this.playerHand.push(card);
				this.flipCardFaceUp(card);
				this.playerHiddenReserve = this.playerHiddenReserve.filter(c => c !== card);
				this.updateStatus(`You revealed ${this.formatCard(card)} from hidden reserve`, true);
				this.positionCards();
				this.saveGameState();
			}
		}
	}

	private handleHiddenReserveSelection(card: Card): void {
		card.selected = !card.selected;

		const selectedCount = this.playerHand.filter(c => c.selected).length;

		if (selectedCount === 3) {
			this.playButton.visible = true;
			this.updateStatus('Click "Play Cards" to confirm your hidden reserve', false)
		} else {
			this.playButton.visible = false;
			this.updateStatus(`Select 3 cards for your hidden reserve (${selectedCount}/3)`, false)
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
			this.updateStatus(`Valid placement! Click "Play Cards" to add to visible reserve.`, false)
		} else if (selectedCards.length > 0) {
			this.playButton.visible = false;
			this.updateStatus(`Invalid placement - cards must be same kind or a straight of 3+`, false)
		} else {
			this.playButton.visible = false;
			this.updateStatus(`Select cards for visible reserve placement ${this.playerVisibleReserve.length + 1}/3`, false)
		}
	}

	private handlePlayerTurnSelection(card: Card): void {
		card.selected = !card.selected;
		this.positionCards();

		const selectedCards = this.playerHand.filter(c => c.selected);
		const placement = this.validatePlacement(selectedCards);

		if (placement && this.canPlayOnStack(placement)) {
			this.playButton.visible = true;
			this.updateStatus(`Valid play! Click "Play Cards" to place on stack.`, false);
		} else if (selectedCards.length > 0 && placement) {
			this.playButton.visible = false;
			this.updateStatus(`Cannot play - cards too low for current stack.`, false);
		} else if (selectedCards.length > 0) {
			this.playButton.visible = false;
			this.updateStatus(`Invalid placement - cards must be same suit or a straight of 3+`, false);
		} else {
			this.playButton.visible = false;
			const pickupOption = this.stack.length > 0 ? ' or take the stack' : '';
			this.updateStatus(`Your turn - select cards to play${pickupOption}`, false);
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

		// Clear selection state
		this.playerHiddenReserve.forEach(card => {
			card.selected = false;
		});

		// Flip remaining cards face up so player can see them
		this.playerHand.forEach(card => this.flipCardFaceUp(card));

		// Computer places visible reserve to give player advantage
		this.computerMakesVisibleReserve();

		this.gamePhase = 'selecting-visible-reserve';
		this.playButton.visible = false;
		this.updateStatus('Select cards for visible reserve placement 1/3', true);

		// Position all cards including new reserve cards
		this.positionCards();
		this.positionReserveCards();

		this.saveGameState();
	}

	private completeVisibleReservePlacement(): void {
		const selected = this.playerHand.filter(c => c.selected);
		const placement = this.validatePlacement(selected);

		if (!placement || this.playerVisibleReserve.length >= 3) return;

		// Clear selection state
		selected.forEach(card => card.selected = false);

		this.playerVisibleReserve.push(placement);
		this.playerHand = this.playerHand.filter(c => !selected.includes(c));

		// Draw back to 3 if needed
		this.drawToMinimum(this.playerHand);

		if (this.playerVisibleReserve.length === 3) {
			this.startPlayerTurn();
		} else {
			this.updateStatus(`Select cards for visible reserve placement ${this.playerVisibleReserve.length + 1}/3`, false);
		}

		this.playButton.visible = false;
		this.positionCards();
		this.positionReserveCards();
		this.updateDeckDisplay();

		this.saveGameState();
	}

	private playSelectedCards(): void {
		const selected = this.playerHand.filter(c => c.selected);
		const placement = this.validatePlacement(selected);

		if (!placement || !this.canPlayOnStack(placement)) return;

		// Log the play
		const cardsDescription = this.formatCards(placement.cards);
		this.updateStatus(`You played ${cardsDescription}`, true);

		this.playOnStack(placement);
		this.playerHand = this.playerHand.filter(c => !c.selected);

		this.drawToMinimum(this.playerHand);

		this.playButton.visible = false;
		this.positionCards();
		this.updateStackDisplay();
		this.updateDeckDisplay();

		// Check for Aces - they clear the stack
		const hasAce = placement.cards.some(c => c.rank === 14);
		if (hasAce) {
			this.discardStack();
			this.updateStatus('Ace! Stack cleared. Play again!', true);
			// Player goes again - stay in player-turn phase
			this.saveGameState();
		} else {
			// Check if player is out of cards
			if (this.checkWinCondition()) return;

			// startComputerTurn() calls saveGameState() which triggers action-req
			this.startComputerTurn();
		}
	}

	private computerMakesVisibleReserve(): void {
		// Stub: computer randomly makes 3 placements
		for (let i = 0; i < 3; i++) {
			if (this.computerHand.length === 0) break;

			// Try to make a valid placement
			const card = this.computerHand.pop()!;

			// Flip face up for visible reserve
			this.flipCardFaceUp(card);

			this.computerVisibleReserve.push({ cards: [card], type: 'single' });

			this.drawToMinimum(this.computerHand);
		}

		// Position all reserve cards
		this.positionReserveCards();
	}

	private startPlayerTurn(): void {
		this.gamePhase = 'player-turn';

		if (this.playerHand.length > 0)
			this.updateStatus('Your turn - select cards to play', true);
		else
			this.updateStatus('Your turn - select a hidden reserve card', true);
	}

	private startComputerTurn(): void {
		this.gamePhase = 'computer-turn';
		this.updateStatus('Computer is thinking...', false);
		this.drawToMinimum(this.computerHand);
		this.saveGameState();
	}

	private computerTurn(action: Action): void {
		console.log(action);

		switch (action.action) {
			case 'play': {
				const selectedCards = this.computerHand.filter((c, index) => action.indexes!.includes(index));
				this.computerHand = this.computerHand.filter(c => !selectedCards.includes(c));
				const placement = this.validatePlacement(selectedCards)!;

				// Log the play with specific cards
				const cardsDescription = this.formatCards(placement.cards);
				this.updateStatus(`Computer played ${cardsDescription}`, true);

				this.playOnStack(placement);

				// Check for Ace - clears stack and computer plays again
				const hasAce = placement.cards.some(c => c.rank === 14);
				if (hasAce) {
					this.discardStack();
					this.updateStatus('Ace! Stack cleared. Computer plays again.', true);
					this.updateStackDisplay();
					this.positionCards();
					this.drawToMinimum(this.computerHand);
					this.saveGameState(); // This will trigger another action-req
					return;
				}

				this.drawToMinimum(this.computerHand);
				break;
			}
			case 'stack': {
				const stackSize = this.stack.length;
				this.takeStack(this.computerHand);
				this.updateStatus(`Computer picked up the stack (${stackSize} cards)`, true);
				break;
			}
			case 'hidden': {
				const hiddenIndex = action.indexes?.[0] ?? 0;
				const card = this.computerHiddenReserve.splice(hiddenIndex, 1)[0];
				if (card) {
					this.flipCardFaceUp(card);
					const placement = { cards: [card], type: 'single' as const };

					if (this.canPlayOnStack(placement)) {
						this.playOnStack(placement);
						this.updateStatus(`Computer revealed and played ${this.formatCard(card)} from hidden reserve`, true);

						// Check for Ace
						if (card.rank === 14) {
							this.discardStack();
							this.updateStatus('Ace! Stack cleared. Computer plays again.', true);
							this.updateStackDisplay();
							this.positionCards();
							this.positionReserveCards();
							this.saveGameState();
							return;
						}
					} else {
						// Card can't be played, computer takes the stack plus the revealed card
						const stackSize = this.stack.length;
						this.flipCardFaceDown(card);
						this.computerHand.push(card);
						this.takeStack(this.computerHand);
						this.updateStatus(`Computer revealed ${this.formatCard(card)} but couldn't play it - picked up the stack (${stackSize} cards)`, true);
					}
				}
				break;
			}
		}

		// Check win condition
		if (this.checkWinCondition()) return;

		this.updateStackDisplay();
		this.updateDeckDisplay();
		this.positionCards();
		this.positionReserveCards();

		this.startPlayerTurn();
		this.saveGameState();
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

	private playOnStack(placement: Placement): void {
		placement.cards.sort((a, b) => a.rank - b.rank);

		// Add cards to stack and animate them to stack position
		placement.cards.forEach(card => {
			this.stack.push(card);
			this.flipCardFaceUp(card);
			this.animateCard(card.container, this.stackContainer.x, this.stackContainer.y);
		});

		let z = 0;
		this.stack.forEach(card => card.container.zIndex = z++);
	}

	private takeStack(hand: Card[]): void {
		this.stack.forEach(card => {
			if (hand === this.computerHand)
				this.flipCardFaceDown(card);

			card.selected = false; // Needed to prevent top stack card from being selected
			hand.push(card);
		});
		this.stack = [];

		if (hand === this.playerHand) {
			this.sortHand(hand);
		}

		this.positionCards();
	}

	private discardStack(): void {
		this.stack.forEach(card => card.container.destroy());
		this.stack = [];
	}

	private takeVisibleReserve(hand: Card[]): void {
		if (hand === this.playerHand) {
			this.playerVisibleReserve.forEach(placement => {
				hand.push(...placement.cards);
			})
			this.playerVisibleReserve = [];
		} else {
			this.computerVisibleReserve.forEach(placement => {
				placement.cards.forEach(card => this.flipCardFaceDown(card))
				hand.push(...placement.cards);
			})
			this.computerVisibleReserve = [];
		}

		this.positionCards();
	}

	private drawToMinimum(hand: Card[]): void {
		while (hand.length < 3 && this.deck.length > 0) {
			const card = this.deck.pop()!;

			if (hand === this.playerHand)
				this.flipCardFaceUp(card);

			hand.push(card);
		}

		if (hand.length === 0) {
			this.takeVisibleReserve(hand);
		}

		if (hand === this.playerHand)
			this.sortHand(hand);

		this.positionCards();
	}

	private checkWinCondition(): boolean {
		// Check player win
		if (this.playerHand.length === 0 &&
			this.playerVisibleReserve.length === 0 &&
			this.playerHiddenReserve.length === 0) {
			this.gamePhase = 'game-over';
			this.updateStatus('You win! 🎉', true);
			this.playButton.visible = false;
			this.clearGameState();
			return true;
		}

		// Check computer win
		if (this.computerHand.length === 0 &&
			this.computerVisibleReserve.length === 0 &&
			this.computerHiddenReserve.length === 0) {
			this.gamePhase = 'game-over';
			this.updateStatus('Computer wins! 💔', true);
			this.playButton.visible = false;
			this.clearGameState();
			return true;
		}

		return false;
	}

	private updateDeckDisplay(): void {
		// Clean up placeholder if it exists
		this.deckContainer.removeChildren();
		this.deckContainer.addChild(this.deckText);

		const placeholder = new Graphics();
		placeholder.roundRect(0, 0, CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS);
		placeholder.stroke({ color: 0xffffff, width: 2, alpha: 0.5 });
		this.deckContainer.addChildAt(placeholder, 0);

		this.deckText.text = `${this.deck.length}`;
		this.deckText.y = CARD_HEIGHT + 10;
		this.deckText.x = CARD_WIDTH / 2;
	}

	private updateStackDisplay(): void {
		this.stackContainer.removeChildren();
		this.stackContainer.addChild(this.stackText);

		// Background placeholder
		const placeholder = new Graphics();
		placeholder.roundRect(0, 0, CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS);
		placeholder.stroke({ color: 0xffffff, width: 2, alpha: 0.5 });
		this.stackContainer.addChildAt(placeholder, 0);

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

	private positionCards(immediate = false): void {
		const screenWidth = this.app.screen.width;
		const screenHeight = this.app.screen.height;

		const playerTotalWidth = (this.playerHand.length - 1) * CARD_SPACING + CARD_WIDTH;
		const centerOffset = (screenWidth - playerTotalWidth) / 2;
		const playerStartX = playerTotalWidth <= screenWidth ? centerOffset : this.handScrollOffset;
		const playerBaseY = screenHeight - CARD_HEIGHT * UNSELECTED_VISIBLE;

		this.playerHand.forEach((card, index) => {
			const targetX = playerStartX + index * CARD_SPACING;
			let targetY = playerBaseY;
			if (card.selected) targetY -= SELECTED_RISE;
			else if (card.hovered) targetY -= HOVER_RISE;

			if (immediate) {
				card.container.x = targetX;
				card.container.y = targetY;
			} else {
				this.animateCard(card.container, targetX, targetY);
			}
		});

		const computerTotalWidth = (this.computerHand.length - 1) * CARD_SPACING + CARD_WIDTH;
		const computerStartX = (screenWidth - computerTotalWidth) / 2;
		const computerBaseY = -CARD_HEIGHT * (1 - COMPUTER_HAND_VISIBLE);

		this.computerHand.forEach((card, index) => {
			const targetX = computerStartX + index * CARD_SPACING;
			let targetY = computerBaseY;

			if (immediate) {
				card.container.x = targetX;
				card.container.y = targetY;
			} else {
				this.animateCard(card.container, targetX, targetY);
			}
		})

		this.positionUI();
		this.updateScrollArrows();
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

	private positionReserveCards(immediate = false): void {
		// Position player's hidden reserve (3 cards in a row)
		this.playerHiddenReserve.forEach((card, index) => {
			const targetX = this.playerReserveBaseX + index * RESERVE_SPACING;
			const targetY = this.playerReserveBaseY;
			card.container.zIndex = 0;

			if (immediate) {
				card.container.x = targetX;
				card.container.y = targetY;
			} else {
				this.animateCard(card.container, targetX, targetY);
			}
		});

		// Position player's visible reserve (stacked on top of hidden reserve)
		this.playerVisibleReserve.forEach((placement, pileIndex) => {
			placement.cards.forEach((card, cardIndex) => {
				const targetX = this.playerReserveBaseX + pileIndex * RESERVE_SPACING;
				// Stack cards downward, with each card peeking out
				const targetY = this.playerReserveBaseY + cardIndex * RESERVE_CARD_PEEK;
				card.container.zIndex = 10 + cardIndex;

				if (immediate) {
					card.container.x = targetX;
					card.container.y = targetY;
				} else {
					this.animateCard(card.container, targetX, targetY);
				}
			});
		});

		// Position computer's hidden reserve
		this.computerHiddenReserve.forEach((card, index) => {
			const targetX = this.computerReserveBaseX + index * RESERVE_SPACING;
			const targetY = this.computerReserveBaseY;
			card.container.zIndex = 0;

			if (immediate) {
				card.container.x = targetX;
				card.container.y = targetY;
			} else {
				this.animateCard(card.container, targetX, targetY);
			}
		});

		// Position computer's visible reserve
		this.computerVisibleReserve.forEach((placement, pileIndex) => {
			placement.cards.forEach((card, cardIndex) => {
				const targetX = this.computerReserveBaseX + pileIndex * RESERVE_SPACING;
				const targetY = this.computerReserveBaseY + cardIndex * RESERVE_CARD_PEEK;
				card.container.zIndex = 10 + cardIndex;

				if (immediate) {
					card.container.x = targetX;
					card.container.y = targetY;
				} else {
					this.animateCard(card.container, targetX, targetY);
				}
			});
		});
	}
}

document.addEventListener("DOMContentLoaded", function() {
	const game = new CardGame();
	game.init().catch(console.error);
});
