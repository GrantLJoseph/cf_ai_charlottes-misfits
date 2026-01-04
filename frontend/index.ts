// my-first-worker/frontend/game.ts
import { Application, Container, Graphics, Text, TextStyle, FederatedPointerEvent } from 'pixi.js';

// Card data
interface Card {
	id: number;
	suit: string;
	rank: string;
	color: string;
	selected: boolean;
	hovered: boolean;
	container: Container;
}

// Card configuration
const CARD_WIDTH = 120;
const CARD_HEIGHT = 168;
const CARD_RADIUS = 12;
const CARD_SPACING = 140;
const UNSELECTED_VISIBLE = 0.5; // How much of unselected card is visible
const SELECTED_RISE = 80; // How much selected card rises
const HOVER_RISE = 10;

// Sample cards
const CARD_DATA = [
	{ suit: '♥', rank: 'A', color: '#dc2626' },
	{ suit: '♠', rank: 'K', color: '#1f2937' },
	{ suit: '♦', rank: 'Q', color: '#dc2626' },
	{ suit: '♣', rank: 'J', color: '#1f2937' },
	{ suit: '♥', rank: '10', color: '#dc2626' },
];

class CardGame {
	private app: Application;
	private cards: Card[] = [];
	private handContainer: Container;

	constructor() {
		this.app = new Application();
		this.handContainer = new Container();
	}

	async init(): Promise<void> {
		// Initialize PixiJS
		await this.app.init({
			background: '#1a472a',
			resizeTo: window,
			antialias: true,
		});

		// Add canvas to DOM
		const container = document.getElementById('game-container');
		if (!container) throw Error('Cannot get game container');
		container.appendChild(this.app.canvas);

		// Set up the hand container
		this.app.stage.addChild(this.handContainer);

		// Create cards
		this.createCards();

		// Position cards initially
		this.positionCards();

		// Handle window resize
		window.addEventListener('resize', () => this.positionCards());
	}

	private createCards(): void {
		CARD_DATA.forEach((data, index) => {
			const card = this.createCard(index, data.suit, data.rank, data.color);
			this.cards.push(card);
			this.handContainer.addChild(card.container);
		});
	}

	private createCard(id: number, suit: string, rank: string, color: string): Card {
		const container = new Container();
		container.eventMode = 'static';
		container.cursor = 'pointer';

		// Card background
		const background = new Graphics();
		background.roundRect(0, 0, CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS);
		background.fill({ color: 0xffffff });
		background.stroke({ color: 0xcccccc, width: 2 });
		container.addChild(background);

		// Card shadow (drawn behind)
		const shadow = new Graphics();
		shadow.roundRect(4, 4, CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS);
		shadow.fill({ color: 0x000000, alpha: 0.2 });
		container.addChildAt(shadow, 0);

		// Rank and suit style
		const textStyle = new TextStyle({
			fontFamily: 'Arial, sans-serif',
			fontSize: 28,
			fontWeight: 'bold',
			fill: color,
		});

		// Top-left rank
		const topRank = new Text({ text: rank, style: textStyle });
		topRank.x = 10;
		topRank.y = 8;
		container.addChild(topRank);

		// Top-left suit (smaller, below rank)
		const smallSuitStyle = new TextStyle({
			fontFamily: 'Arial, sans-serif',
			fontSize: 20,
			fill: color,
		});
		const topSuit = new Text({ text: suit, style: smallSuitStyle });
		topSuit.x = 12;
		topSuit.y = 36;
		container.addChild(topSuit);

		// Center suit (large)
		const centerSuitStyle = new TextStyle({
			fontFamily: 'Arial, sans-serif',
			fontSize: 56,
			fill: color,
		});
		const centerSuit = new Text({ text: suit, style: centerSuitStyle });
		centerSuit.anchor.set(0.5);
		centerSuit.x = CARD_WIDTH / 2;
		centerSuit.y = CARD_HEIGHT / 2;
		container.addChild(centerSuit);

		// Bottom-right rank (rotated)
		const bottomRank = new Text({ text: rank, style: textStyle });
		bottomRank.anchor.set(1, 1);
		bottomRank.x = CARD_WIDTH - 10;
		bottomRank.y = CARD_HEIGHT - 8;
		bottomRank.rotation = Math.PI;
		container.addChild(bottomRank);

		// Bottom-right suit (rotated)
		const bottomSuit = new Text({ text: suit, style: smallSuitStyle });
		bottomSuit.anchor.set(1, 1);
		bottomSuit.x = CARD_WIDTH - 12;
		bottomSuit.y = CARD_HEIGHT - 36;
		bottomSuit.rotation = Math.PI;
		container.addChild(bottomSuit);

		const card: Card = {
			id,
			suit,
			rank,
			color,
			selected: false,
			hovered: false,
			container,
		};

		// Click handler
		container.on('pointerdown', (event: FederatedPointerEvent) => {
			this.toggleCard(card);
		});

		// Hover effects
		container.on('pointerover', () => {
			card.hovered = true;
			this.positionCards();
		});

		container.on('pointerout', () => {
			card.hovered = false;
			this.positionCards();
		});

		return card;
	}

	private toggleCard(card: Card): void {
		card.selected = !card.selected;
		card.hovered = false;

		// Bring selected card to front
		if (card.selected) {
			this.handContainer.setChildIndex(
				card.container,
				this.handContainer.children.length - 1
			);
		}

		this.positionCards();
	}

	private positionCards(): void {
		const screenWidth = this.app.screen.width;
		const screenHeight = this.app.screen.height;

		// Calculate total width of hand
		const totalWidth = (this.cards.length - 1) * CARD_SPACING + CARD_WIDTH;
		const startX = (screenWidth - totalWidth) / 2;

		// Base Y position (bottom of screen, half hidden)
		const baseY = screenHeight - CARD_HEIGHT * UNSELECTED_VISIBLE;

		this.cards.forEach((card, index) => {
			const targetX = startX + index * CARD_SPACING;

			// let targetY = card.selected ? baseY - SELECTED_RISE : baseY;
			let targetY = baseY;
			if (card.selected) targetY -= SELECTED_RISE;
			else if (card.hovered) targetY -= HOVER_RISE;

			// Animate to position
			this.animateCard(card.container, targetX, targetY);
		});
	}

	private animateCard(container: Container, targetX: number, targetY: number): void {
		const duration = 150; // ms
		const startX = container.x;
		const startY = container.y;
		const startTime = performance.now();

		const animate = (currentTime: number) => {
			const elapsed = currentTime - startTime;
			const progress = Math.min(elapsed / duration, 1);

			// Ease out cubic
			const eased = 1 - Math.pow(1 - progress, 3);

			container.x = startX + (targetX - startX) * eased;
			container.y = startY + (targetY - startY) * eased;

			if (progress < 1) {
				requestAnimationFrame(animate);
			}
		};

		requestAnimationFrame(animate);
	}
}

const game = new CardGame();
game.init().catch(console.error);
