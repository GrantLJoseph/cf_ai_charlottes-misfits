// Admin panel functionality

interface UsersResponse {
	users: string[];
}

interface ApiResponse {
	success?: boolean;
	error?: string;
}

class AdminPanel {
	private userList: HTMLUListElement;
	private addForm: HTMLFormElement;
	private addMessage: HTMLElement;
	private listMessage: HTMLElement;
	private newUsernameInput: HTMLInputElement;
	private newPasswordInput: HTMLInputElement;
	private addBtn: HTMLButtonElement;

	constructor() {
		this.userList = document.getElementById('user-list') as HTMLUListElement;
		this.addForm = document.getElementById('add-user-form') as HTMLFormElement;
		this.addMessage = document.getElementById('add-message') as HTMLElement;
		this.listMessage = document.getElementById('list-message') as HTMLElement;
		this.newUsernameInput = document.getElementById('new-username') as HTMLInputElement;
		this.newPasswordInput = document.getElementById('new-password') as HTMLInputElement;
		this.addBtn = document.getElementById('add-btn') as HTMLButtonElement;

		this.init();
	}

	private init(): void {
		this.addForm.addEventListener('submit', (e) => this.handleAddUser(e));
		this.loadUsers();
	}

	private showMessage(element: HTMLElement, text: string, type: 'success' | 'error'): void {
		const messageDiv = document.createElement('div');
		messageDiv.className = `message ${type}`;
		messageDiv.textContent = text;
		element.innerHTML = '';
		element.appendChild(messageDiv);
		setTimeout(() => {
			element.innerHTML = '';
		}, 3000);
	}

	private escapeHtml(text: string): string {
		const div = document.createElement('div');
		div.textContent = text;
		return div.innerHTML;
	}

	async loadUsers(): Promise<void> {
		try {
			const res = await fetch('/api/admin/users');
			const data: UsersResponse = await res.json();

			if (data.users.length === 0) {
				this.userList.innerHTML = '<li class="empty-state">No users found</li>';
				return;
			}

			this.userList.innerHTML = '';
			data.users.forEach((user) => {
				const li = document.createElement('li');
				li.className = 'user-item';

				const nameSpan = document.createElement('span');
				nameSpan.className = user === 'admin' ? 'user-name admin' : 'user-name';
				nameSpan.textContent = user;

				if (user === 'admin') {
					const badge = document.createElement('span');
					badge.className = 'badge';
					badge.textContent = 'Admin';
					nameSpan.appendChild(badge);
				}

				li.appendChild(nameSpan);

				if (user !== 'admin') {
					const deleteBtn = document.createElement('button');
					deleteBtn.className = 'delete-btn';
					deleteBtn.textContent = 'Delete';
					deleteBtn.addEventListener('click', () => this.deleteUser(user));
					li.appendChild(deleteBtn);
				}

				this.userList.appendChild(li);
			});
		} catch {
			this.showMessage(this.listMessage, 'Failed to load users', 'error');
		}
	}

	async deleteUser(username: string): Promise<void> {
		if (!confirm(`Are you sure you want to delete "${username}"?`)) {
			return;
		}

		try {
			const res = await fetch(`/api/admin/users/${encodeURIComponent(username)}`, {
				method: 'DELETE'
			});
			const data: ApiResponse = await res.json();

			if (data.success) {
				this.showMessage(this.listMessage, 'User deleted', 'success');
				this.loadUsers();
			} else {
				this.showMessage(this.listMessage, data.error || 'Failed to delete user', 'error');
			}
		} catch {
			this.showMessage(this.listMessage, 'Failed to delete user', 'error');
		}
	}

	private async handleAddUser(e: Event): Promise<void> {
		e.preventDefault();

		const username = this.newUsernameInput.value.trim();
		const password = this.newPasswordInput.value;

		if (!username || !password) {
			return;
		}

		this.addBtn.disabled = true;
		this.addBtn.textContent = 'Adding...';

		try {
			const res = await fetch('/api/admin/users', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ username, password })
			});
			const data: ApiResponse = await res.json();

			if (data.success) {
				this.showMessage(this.addMessage, 'User added successfully', 'success');
				this.newUsernameInput.value = '';
				this.newPasswordInput.value = '';
				this.loadUsers();
			} else {
				this.showMessage(this.addMessage, data.error || 'Failed to add user', 'error');
			}
		} catch {
			this.showMessage(this.addMessage, 'Failed to add user', 'error');
		} finally {
			this.addBtn.disabled = false;
			this.addBtn.textContent = 'Add User';
		}
	}
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
	new AdminPanel();
});