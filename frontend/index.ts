import { Application, Container, Graphics, Text, TextStyle, FederatedPointerEvent } from 'pixi.js';

class Chat {
	private popup: HTMLElement;
	private messagesContainer: HTMLElement;
	private input: HTMLInputElement;
	private sendButton: HTMLElement;
	private toggleButton: HTMLElement;
	private closeButton: HTMLElement;
	private notificationDot: HTMLElement;
	private isOpen: boolean = false;

	constructor() {
		this.popup = document.getElementById('chat-popup')!;
		this.messagesContainer = document.getElementById('chat-messages')!;
		this.input = document.getElementById('chat-input') as HTMLInputElement;
		this.sendButton = document.getElementById('chat-send')!;
		this.toggleButton = document.getElementById('chat-toggle')!;
		this.closeButton = document.getElementById('chat-close')!;
		this.notificationDot = document.getElementById('chat-notification')!;

		this.setupEventListeners();
	}

	private setupEventListeners(): void {
		this.toggleButton.addEventListener('click', () => this.toggle());
		this.closeButton.addEventListener('click', () => this.close());
		this.sendButton.addEventListener('click', () => this.sendPlayerMessage());
		this.input.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				this.sendPlayerMessage();
			}
		});
	}

	toggle(): void {
		if (this.isOpen) {
			this.close();
		} else {
			this.open();
		}
	}

	open(): void {
		this.isOpen = true;
		this.popup.classList.remove('chat-hidden');
		this.clearNotification();
		this.scrollToBottom();
	}

	close(): void {
		this.isOpen = false;
		this.popup.classList.add('chat-hidden');
	}

	private clearNotification(): void {
		this.notificationDot.classList.remove('visible');
	}

	private showNotification(): void {
		if (!this.isOpen) {
			this.notificationDot.classList.add('visible');
		}
	}

	private scrollToBottom(): void {
		this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
	}

	private sendPlayerMessage(): void {
		const text = this.input.value.trim();
		if (!text) return;

		this.addMessage(text, 'player');
		this.input.value = '';
	}

	addMessage(text: string, type: 'system' | 'player' = 'system'): void {
		const messageEl = document.createElement('div');
		messageEl.className = `chat-message ${type}`;
		messageEl.textContent = text;
		this.messagesContainer.appendChild(messageEl);

		if (type === 'system') {
			this.showNotification();
		}

		this.scrollToBottom();
	}
}

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

function rankToString(rank: number): string {
	if (rank === 14) return 'A';
	if (rank === 13) return 'K';
	if (rank === 12) return 'Q';
	if (rank === 11) return 'J';
	return rank.toString();
}

// Initialize chat system
let chatSystem;

// Chat system
let chatOpen = false;
let hasUnreadMessages = false;

export function addChatMessage(message: string, type: 'system' | 'player' = 'system'): void {
	const messagesContainer = document.getElementById('chat-messages');
	if (!messagesContainer) return;

	const messageEl = document.createElement('div');
	messageEl.className = `chat-message ${type}`;
	messageEl.textContent = message;
	messagesContainer.appendChild(messageEl);

	// Auto-scroll to bottom
	messagesContainer.scrollTop = messagesContainer.scrollHeight;

	// Show notification dot if chat is closed and it's a system message
	if (!chatOpen && type === 'system') {
		hasUnreadMessages = true;
		const notificationDot = document.getElementById('chat-notification');
		if (notificationDot) {
			notificationDot.classList.add('visible');
		}
	}
}

function initChat(): void {
	const chatToggle = document.getElementById('chat-toggle');
	const chatPopup = document.getElementById('chat-popup');
	const chatClose = document.getElementById('chat-close');
	const chatInput = document.getElementById('chat-input') as HTMLInputElement;
	const chatSend = document.getElementById('chat-send');
	const notificationDot = document.getElementById('chat-notification');

	if (!chatToggle || !chatPopup || !chatClose || !chatInput || !chatSend) return;

	// Toggle chat
	chatToggle.addEventListener('click', () => {
		chatOpen = !chatOpen;
		chatPopup.classList.toggle('chat-hidden', !chatOpen);

		if (chatOpen) {
			// Clear notification
			hasUnreadMessages = false;
			if (notificationDot) {
				notificationDot.classList.remove('visible');
			}
			chatInput.focus();
		}
	});

	// Close button
	chatClose.addEventListener('click', () => {
		chatOpen = false;
		chatPopup.classList.add('chat-hidden');
	});

	// Send message
	const sendMessage = () => {
		const message = chatInput.value.trim();
		if (message) {
			addChatMessage(message, 'player');
			chatInput.value = '';
		}
	};

	chatSend.addEventListener('click', sendMessage);
	chatInput.addEventListener('keypress', (e) => {
		if (e.key === 'Enter') {
			sendMessage();
		}
	});
}

class CardGame {
	private app: Application;
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
	}

	async init(): Promise<void> {
		await this.app.init({
			background: '#1a472a',
			resizeTo: window,
			antialias: true,
		});

		initChat();

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
		this.createScrollArrows();

		this.initializeDeck();
		this.positionUI();

		// Position all deck cards at deck location
		this.positionDeckCards();

		this.dealInitialCards();

		// Computer makes hidden reserve selection first
		for (let i = 0; i < 3; i++) {
			const card = this.computerHand.pop()!;
			this.computerHiddenReserve.push(card);
		}

		this.positionCards();
		this.positionReserveCards();

		window.addEventListener('resize', () => {
			this.animatingCards.clear();
			this.positionUI();
			this.positionDeckCards();
			this.positionStackCards();
			this.positionReserveCards(true);
			this.positionCards(true);
		});

		// Send hello world message to test the chat system
		addChatMessage('Hello, World! Welcome to the card game.');
	}

	private updateStatus(text: string, logToChat: boolean): void {
		if (logToChat && text != this.statusText.text) {
			addChatMessage(text, 'system');
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
		const screenHeight = this.app.screen.height;

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
		this.deckContainer.y = screenHeight / 2 - CARD_HEIGHT / 2;``

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

		this.positionCards();
		this.updateDeckDisplay();
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
				this.takeStack(this.playerHand);

				this.updateStackDisplay();
				this.positionCards();

				this.startComputerTurn();
			// Drawing from hidden reserve
			} else if (this.playerHand.length == 0 && this.deck.length == 0 && this.playerVisibleReserve.length == 0 && this.playerHiddenReserve.includes(card)) {
				this.playerHand.push(card);
				this.flipCardFaceUp(card);
				this.playerHiddenReserve = this.playerHiddenReserve.filter(c => c !== card);
				this.positionCards();
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
	}

	private playSelectedCards(): void {
		const selected = this.playerHand.filter(c => c.selected);
		const placement = this.validatePlacement(selected);

		if (!placement || !this.canPlayOnStack(placement)) return;

		this.playOnStack(placement);
		this.playerHand = this.playerHand.filter(c => !c.selected);

		this.drawToMinimum(this.playerHand);

		// Check for Aces - they clear the stack
		const hasAce = placement.cards.some(c => c.rank === 14);
		if (hasAce) {
			this.discardStack();
			this.updateStatus('Ace! Stack cleared. Play again!', true);
			// Player goes again - stay in player-turn phase
		} else {
			// Check if player is out of cards
			if (this.checkWinCondition()) return;

			this.startComputerTurn();
		}

		this.playButton.visible = false;
		this.positionCards();
		this.updateStackDisplay();
		this.updateDeckDisplay();
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
		setTimeout(() => this.computerTurn(), 1000);
	}

	private computerTurn(): void {
		this.drawToMinimum(this.computerHand);

		// Stub: computer tries to play a random card or picks up stack
		if (this.computerHand.length === 0) {
			// Computer needs to use visible reserve
			if (this.computerVisibleReserve.length > 0) {
				this.computerVisibleReserve.forEach(placement => {
					this.computerHand.push(...placement.cards);
					this.computerVisibleReserve = [];
					this.updateStatus("Computer took their visible reserve", true);
				});
			} else if (this.computerHiddenReserve.length > 0) {
				// Use hidden reserve
				const card = this.computerHiddenReserve.pop()!;
				const placement = { cards: [card], type: 'single' as const };

				this.computerHand.push(...placement.cards);

				this.updateStatus("Computer drew from hidden reserve", true);
				this.updateStackDisplay();
				this.positionCards();
			}
		}

		// Try to play any card
		let played = false;
		for (let i = 0; i < this.computerHand.length; i++) {
			const card = this.computerHand[i];
			const placement = { cards: [card], type: 'single' as const };

			if (this.canPlayOnStack(placement)) {
				this.playOnStack(placement);
				this.computerHand.splice(i, 1);
				played = true;

				// Check for Ace
				if (card.rank === 14) {
					this.discardStack();

					this.stack = [];
					// Computer goes again

					this.updateStatus('Computer played Ace! Stack cleared. They play again.', true);

					setTimeout(() => this.computerTurn(), 1000);
					return;
				}

				break;
			}
		}

		// Check win condition
		if (this.checkWinCondition()) return;

		if (!played) {
			// Pick up stac
			this.takeStack(this.computerHand);
			this.updateStatus('Computer picked up the stack', true);
		} else {
			this.drawToMinimum(this.computerHand);
			this.updateStatus('Computer played a card', true);
		}

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

	private playOnStack(placement: Placement): void {
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

			// If this is the player's hand, flip the card face up
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
			return true;
		}

		// Check computer win
		if (this.computerHand.length === 0 &&
			this.computerVisibleReserve.length === 0 &&
			this.computerHiddenReserve.length === 0) {
			this.gamePhase = 'game-over';
			this.updateStatus('Computer wins! 💔', true);
			this.playButton.visible = false;
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
	chatSystem = new Chat();

	const game = new CardGame();
	game.init().catch(console.error);
});
