export default class Chat {
	private popup: HTMLElement;
	private messagesContainer: HTMLElement;
	private input: HTMLInputElement;
	private sendButton: HTMLElement;
	private toggleButton: HTMLElement;
	private closeButton: HTMLElement;
	private notificationDot: HTMLElement;
	private isOpen: boolean = false;
	private onSendMessage: ((message: string) => void) | null = null;

	constructor(onSendMessage?: (message: string) => void) {
		this.popup = document.getElementById('chat-popup')!;
		this.messagesContainer = document.getElementById('chat-messages')!;
		this.input = document.getElementById('chat-input') as HTMLInputElement;
		this.sendButton = document.getElementById('chat-send')!;
		this.toggleButton = document.getElementById('chat-toggle')!;
		this.closeButton = document.getElementById('chat-close')!;
		this.notificationDot = document.getElementById('chat-notification')!;
		this.onSendMessage = onSendMessage || null;

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
		this.notificationDot.classList.remove('visible');
		this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
		this.input.focus();
	}

	close(): void {
		this.isOpen = false;
		this.popup.classList.add('chat-hidden');
	}

	private sendPlayerMessage(): void {
		const text = this.input.value.trim();
		if (!text) return;

		this.addMessage(text, 'player');
		this.input.value = '';

		// Call the callback if set
		if (this.onSendMessage) {
			this.onSendMessage(text);
		}
	}

	addMessage(text: string, type: 'system' | 'player' = 'system'): void {
		const messageEl = document.createElement('div');
		messageEl.className = `chat-message ${type}`;
		messageEl.textContent = text;
		this.messagesContainer.appendChild(messageEl);

		// Auto-scroll to bottom
		this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;

		// Show notification dot if chat is closed and it's a system message
		if (!this.isOpen && type === 'system') {
			this.notificationDot.classList.add('visible');
		}
	}
}
