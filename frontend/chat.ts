export default class Chat {
	private popup: HTMLElement;
	private messagesContainer: HTMLElement;
	private input: HTMLInputElement;
	private sendButton: HTMLElement;
	private toggleButton: HTMLElement;
	private closeButton: HTMLElement;
	private notificationDot: HTMLElement;
	private isOpen: boolean = false;
	private hasUnreadMessages = false;
	private chatOpen = false;

	constructor() {
		this.popup = document.getElementById('chat-popup')!;
		this.messagesContainer = document.getElementById('chat-messages')!;
		this.input = document.getElementById('chat-input') as HTMLInputElement;
		this.sendButton = document.getElementById('chat-send')!;
		this.toggleButton = document.getElementById('chat-toggle')!;
		this.closeButton = document.getElementById('chat-close')!;
		this.notificationDot = document.getElementById('chat-notification')!;

		this.setupEventListeners();

		const chatToggle = document.getElementById('chat-toggle');
		const chatPopup = document.getElementById('chat-popup');
		const chatClose = document.getElementById('chat-close');
		const chatInput = document.getElementById('chat-input') as HTMLInputElement;
		const chatSend = document.getElementById('chat-send');
		const notificationDot = document.getElementById('chat-notification');

		if (!chatToggle || !chatPopup || !chatClose || !chatInput || !chatSend) return;

		// Toggle chat
		chatToggle.addEventListener('click', () => {
			this.chatOpen = !this.chatOpen;
			chatPopup.classList.toggle('chat-hidden', !this.chatOpen);

			if (this.chatOpen) {
				// Clear notification
				this.hasUnreadMessages = false;
				if (notificationDot) {
					notificationDot.classList.remove('visible');
				}
				chatInput.focus();
			}
		});

		// Close button
		chatClose.addEventListener('click', () => {
			this.chatOpen = false;
			chatPopup.classList.add('chat-hidden');
		});

		// Send message
		const sendMessage = () => {
			const message = chatInput.value.trim();
			if (message) {
				this.addMessage(message, 'player');
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
		const messagesContainer = document.getElementById('chat-messages');
		if (!messagesContainer) return;

		const messageEl = document.createElement('div');
		messageEl.className = `chat-message ${type}`;
		messageEl.textContent = text;
		messagesContainer.appendChild(messageEl);

		// Auto-scroll to bottom
		messagesContainer.scrollTop = messagesContainer.scrollHeight;

		// Show notification dot if chat is closed and it's a system message
		if (!this.chatOpen && type === 'system') {
			this.hasUnreadMessages = true;
			const notificationDot = document.getElementById('chat-notification');
			if (notificationDot) {
				notificationDot.classList.add('visible');
			}
		}
	}
}
