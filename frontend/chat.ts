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

	// Resize state
	private isResizing: boolean = false;
	private resizeDirection: string = '';
	private startX: number = 0;
	private startY: number = 0;
	private startWidth: number = 0;
	private startHeight: number = 0;

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
		this.setupResizeHandles();
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

	private setupResizeHandles(): void {
		// Create resize handles
		const handles = ['top', 'left', 'top-left'];
		handles.forEach(dir => {
			const handle = document.createElement('div');
			handle.className = `chat-resize-handle ${dir}`;
			handle.addEventListener('mousedown', (e) => this.startResize(e, dir));
			this.popup.appendChild(handle);
		});

		// Global mouse events for resizing
		document.addEventListener('mousemove', (e) => this.handleResize(e));
		document.addEventListener('mouseup', () => this.stopResize());
	}

	private startResize(e: MouseEvent, direction: string): void {
		e.preventDefault();
		this.isResizing = true;
		this.resizeDirection = direction;
		this.startX = e.clientX;
		this.startY = e.clientY;
		this.startWidth = this.popup.offsetWidth;
		this.startHeight = this.popup.offsetHeight;

		// Disable transition during resize for smooth dragging
		this.popup.style.transition = 'none';
	}

	private handleResize(e: MouseEvent): void {
		if (!this.isResizing) return;

		const deltaX = this.startX - e.clientX;
		const deltaY = this.startY - e.clientY;

		const minWidth = 280;
		const minHeight = 200;
		const maxWidth = 600;
		const maxHeight = window.innerHeight * 0.8;

		if (this.resizeDirection.includes('left')) {
			const newWidth = Math.min(maxWidth, Math.max(minWidth, this.startWidth + deltaX));
			this.popup.style.width = `${newWidth}px`;
		}

		if (this.resizeDirection.includes('top')) {
			const newHeight = Math.min(maxHeight, Math.max(minHeight, this.startHeight + deltaY));
			this.popup.style.height = `${newHeight}px`;
		}
	}

	private stopResize(): void {
		if (this.isResizing) {
			this.isResizing = false;
			this.resizeDirection = '';
			// Restore transition
			this.popup.style.transition = '';
		}
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

	clear(): void {
		this.messagesContainer.innerHTML = '';
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
