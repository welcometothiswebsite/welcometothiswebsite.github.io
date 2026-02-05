// === COMPLETE WORKING CHAT ===
class DiscordChat {
    constructor() {
        this.SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyoYUoRPsMDO31zE3q5GZ2kwyrrHs8Uj5pKnAOiBJAuU9y5fs51olo3QtBNVND8d74T/exec';
        this.user = null;
        this.currentChannel = 'general';
        this.refreshInterval = null;
        
        this.init();
    }

    init() {
        this.elements = {
            loginScreen: document.getElementById('login-screen'),
            chatContainer: document.getElementById('chat-container'),
            usernameInput: document.getElementById('username-input'),
            loginButton: document.getElementById('login-button'),
            messageInput: document.getElementById('message-input'),
            sendButton: document.getElementById('send-button'),
            messagesContainer: document.getElementById('messages-container'),
            channelList: document.getElementById('channel-list'),
            currentChannelEl: document.getElementById('current-channel'),
            userAvatar: document.getElementById('user-avatar'),
            userName: document.getElementById('user-name'),
            userId: document.getElementById('user-id')
        };

        this.setupEventListeners();
        
        // Try to auto-login with saved username
        const savedUsername = localStorage.getItem('chat_username');
        if (savedUsername) {
            this.elements.usernameInput.value = savedUsername;
        }
    }

    setupEventListeners() {
        this.elements.loginButton.addEventListener('click', () => this.login());
        this.elements.usernameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.login();
        });

        this.elements.messageInput.addEventListener('input', () => {
            this.elements.sendButton.disabled = !this.elements.messageInput.value.trim();
        });
        
        this.elements.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        
        this.elements.sendButton.addEventListener('click', () => this.sendMessage());

        this.elements.channelList.addEventListener('click', (e) => {
            const channelItem = e.target.closest('.channel-item');
            if (channelItem) {
                this.switchChannel(channelItem.dataset.channel);
            }
        });
    }

    async login() {
        const username = this.elements.usernameInput.value.trim();
        
        if (!username || username.length < 2) {
            this.showNotification('Please enter a username (min 2 characters)', 'error');
            return;
        }

        // Save username
        localStorage.setItem('chat_username', username);
        
        this.user = {
            id: 'user_' + Date.now(),
            username: username
        };
        
        // Update UI
        this.elements.userAvatar.textContent = username.charAt(0).toUpperCase();
        this.elements.userName.textContent = username;
        this.elements.userId.textContent = '#' + this.user.id.substring(0, 4);
        
        // Show chat
        this.elements.loginScreen.style.display = 'none';
        this.elements.chatContainer.style.display = 'flex';
        this.elements.messageInput.disabled = false;
        this.elements.messageInput.focus();
        
        this.addSystemMessage(`Welcome ${username}! 👋`);
        
        // Send join notification
        await this.sendToBackend({
            action: 'send',
            username: 'System',
            channel: 'general',  // Change this to 'system' if you want system channel
            message: `${username} joined the chat`
        });
        
        // Load all messages
        await this.loadMessages();
        
        // Start auto-refresh
        this.startAutoRefresh();
    }

    async sendMessage() {
        if (!this.user) return;

        const messageText = this.elements.messageInput.value.trim();
        if (!messageText) return;

        // Create temporary ID for immediate display
        const tempId = 'temp_' + Date.now();
        const message = {
            id: tempId,
            username: this.user.username,
            message: messageText,
            time: this.formatTime(new Date()),
            channel: this.currentChannel
        };

        // Add to chat immediately
        this.addMessage(message, true);
        
        // Clear input
        this.elements.messageInput.value = '';
        this.elements.sendButton.disabled = true;
        
        // Save to backend
        try {
            const result = await this.sendToBackend({
                action: 'send',
                username: this.user.username,
                channel: this.currentChannel,
                message: messageText
            });
            
            if (result.success) {
                this.showNotification('Message sent ✓');
                // Update the temporary message with real ID if needed
                if (result.id && result.id !== tempId) {
                    const msgElement = document.getElementById('msg-' + tempId);
                    if (msgElement) {
                        msgElement.id = 'msg-' + result.id;
                    }
                }
            } else {
                this.showNotification('Failed to send', 'error');
            }
            
        } catch (error) {
            this.showNotification('Network error', 'error');
            console.error('Send error:', error);
        }
    }

    async sendToBackend(data) {
        const response = await fetch(this.SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return await response.json();
    }

    async loadMessages() {
        if (!this.user) return;

        try {
            // First, clear existing messages (keep system welcome)
            const systemMessages = [];
            const children = Array.from(this.elements.messagesContainer.children);
            
            for (let child of children) {
                const author = child.querySelector('.message-author');
                if (author && author.textContent === 'System') {
                    systemMessages.push(child);
                }
            }
            
            this.elements.messagesContainer.innerHTML = '';
            systemMessages.forEach(msg => this.elements.messagesContainer.appendChild(msg));
            
            // Load messages from backend
            const result = await this.sendToBackend({
                action: 'load',
                channel: this.currentChannel
            });
            
            if (result.success && result.messages) {
                // Add messages in chronological order (oldest to newest)
                result.messages.forEach(msg => {
                    // Check if it's a system message (channel = 'system' or username = 'System')
                    if (msg.channel === 'system' || msg.username === 'System') {
                        // Show all system messages regardless of channel
                        this.addSystemMessage(msg.message);
                    } else if (msg.channel === this.currentChannel) {
                        // Only show regular messages for current channel
                        const isOwn = msg.username === this.user.username;
                        this.addMessage({
                            id: msg.id,
                            username: msg.username,
                            message: msg.message,
                            time: this.formatTime(new Date(msg.timestamp || Date.now())),
                            channel: msg.channel
                        }, isOwn, false);
                    }
                });
                
                this.scrollToBottom();
                this.showNotification(`Loaded ${result.messages.length} messages`);
            }
            
        } catch (error) {
            console.error('Load error:', error);
            this.addSystemMessage('Failed to load messages');
        }
    }

    async checkForNewMessages() {
        if (!this.user) return;

        try {
            const result = await this.sendToBackend({
                action: 'load',
                channel: this.currentChannel
            });
            
            if (result.success && result.messages) {
                // Get current message IDs
                const currentIds = new Set();
                this.elements.messagesContainer.querySelectorAll('.message').forEach(msg => {
                    const id = msg.id.replace('msg-', '');
                    if (id) currentIds.add(id);
                });
                
                // Add new messages
                result.messages.forEach(msg => {
                    if (!currentIds.has(msg.id)) {
                        if (msg.channel === 'system' || msg.username === 'System') {
                            this.addSystemMessage(msg.message);
                        } else if (msg.channel === this.currentChannel) {
                            const isOwn = msg.username === this.user.username;
                            this.addMessage({
                                id: msg.id,
                                username: msg.username,
                                message: msg.message,
                                time: this.formatTime(new Date(msg.timestamp || Date.now())),
                                channel: msg.channel
                            }, isOwn, false);
                        }
                    }
                });
                
                // Scroll if at bottom
                if (this.isAtBottom()) {
                    this.scrollToBottom();
                }
            }
            
        } catch (error) {
            console.error('Check error:', error);
        }
    }

    isAtBottom() {
        const container = this.elements.messagesContainer;
        return container.scrollHeight - container.clientHeight <= container.scrollTop + 100;
    }

    startAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
        
        this.refreshInterval = setInterval(() => {
            this.checkForNewMessages();
        }, 2000); // Check every 2 seconds
    }

    switchChannel(channel) {
        if (channel === this.currentChannel) return;
        
        // Update UI
        document.querySelectorAll('.channel-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-channel="${channel}"]`).classList.add('active');
        
        this.currentChannel = channel;
        this.elements.currentChannelEl.textContent = channel;
        this.elements.messageInput.placeholder = `Message #${channel}`;
        this.elements.messageInput.focus();
        
        // Clear messages and reload for new channel
        this.elements.messagesContainer.innerHTML = '';
        this.addSystemMessage(`Switched to #${channel}`);
        this.loadMessages();
    }

    addMessage(message, isOwn = false, shouldScroll = true) {
        // Skip if already exists
        if (document.getElementById('msg-' + message.id)) return;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message';
        messageDiv.id = 'msg-' + message.id;
        
        const avatarText = message.username.charAt(0).toUpperCase();
        const avatarColor = isOwn ? '#5865f2' : '#3ba55d';

        messageDiv.innerHTML = `
            <div class="message-avatar" style="background: ${avatarColor}">${avatarText}</div>
            <div class="message-content">
                <div class="message-header">
                    <span class="message-author">${message.username}</span>
                    <span class="message-time">${message.time}</span>
                </div>
                <div class="message-text">${this.escapeHtml(message.message)}</div>
            </div>
        `;

        this.elements.messagesContainer.appendChild(messageDiv);
        
        if (shouldScroll && this.isAtBottom()) {
            this.scrollToBottom();
        }
    }

    addSystemMessage(text) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message';
        
        messageDiv.innerHTML = `
            <div class="message-avatar" style="background: #3ba55d;">⚙️</div>
            <div class="message-content">
                <div class="message-header">
                    <span class="message-author" style="color: #3ba55d;">System</span>
                    <span class="message-time">${this.formatTime(new Date())}</span>
                </div>
                <div class="message-text" style="color: var(--text-muted);">${text}</div>
            </div>
        `;

        this.elements.messagesContainer.appendChild(messageDiv);
        
        if (this.isAtBottom()) {
            this.scrollToBottom();
        }
    }

    formatTime(date) {
        return date.toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: true 
        });
    }

    scrollToBottom() {
        setTimeout(() => {
            const container = this.elements.messagesContainer;
            container.scrollTop = container.scrollHeight;
        }, 100);
    }

    showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = message;
        
        if (type === 'error') {
            notification.style.background = '#ed4245';
        } else if (type === 'warning') {
            notification.style.background = '#faa81a';
        }
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Start the app
document.addEventListener('DOMContentLoaded', () => {
    window.chat = new DiscordChat();
});

window.onOhayoClick = function() { 
  window.open("https://docs.google.com/presentation/d/1UHs5OkNe8OUmGGLDXCsOIZLnPpa0n8U8h6UF138u7wo/edit?slide=id.g3bcd012ef2f_7_118#slide=id.g3bcd012ef2f_7_118", "_blank"); 
};
