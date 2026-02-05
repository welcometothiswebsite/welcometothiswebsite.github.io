// === WORKING CHAT - FIXED VERSION ===
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
        
        // Send join message
        this.sendJoinMessage(username);
        
        // Load messages
        await this.loadMessages();
        
        // Start auto-refresh
        this.startAutoRefresh();
    }

    async sendJoinMessage(username) {
        try {
            await fetch(this.SCRIPT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'send',
                    username: 'System',
                    channel: 'system',
                    message: `${username} joined the chat`
                })
            });
        } catch (error) {
            console.log('Join message error:', error);
        }
    }

    async sendMessage() {
        if (!this.user) return;

        const messageText = this.elements.messageInput.value.trim();
        if (!messageText) return;

        // Add to chat immediately
        const tempId = 'temp_' + Date.now();
        this.addMessage({
            id: tempId,
            username: this.user.username,
            message: messageText,
            time: this.formatTime(new Date()),
            channel: this.currentChannel
        }, true);
        
        // Clear input
        this.elements.messageInput.value = '';
        this.elements.sendButton.disabled = true;
        
        // Save to Google Sheets
        try {
            const response = await fetch(this.SCRIPT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'send',
                    username: this.user.username,
                    channel: this.currentChannel,
                    message: messageText
                })
            });
            
            if (response.ok) {
                this.showNotification('Message sent ✓');
            }
            
        } catch (error) {
            this.showNotification('Failed to send', 'error');
        }
    }

    async loadMessages() {
        if (!this.user) return;

        try {
            // Clear existing messages (keep system welcome)
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
            
            // Load messages from backend - FIXED: Use GET instead of POST
            const response = await fetch(`${this.SCRIPT_URL}?action=load&channel=general&t=${Date.now()}`);
            
            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('Backend response:', data); // Debug log
            
            if (data.success && data.messages) {
                // Sort messages by timestamp (oldest first)
                const sortedMessages = [...data.messages].sort((a, b) => {
                    const timeA = new Date(a.timestamp || a.date || Date.now());
                    const timeB = new Date(b.timestamp || b.date || Date.now());
                    return timeA - timeB;
                });
                
                // Add messages
                sortedMessages.forEach(msg => {
                    // If channel is 'system' in spreadsheet
                    if (msg.channel === 'system') {
                        this.addSystemMessage(msg.message);
                    } else {
                        // Regular message for current channel
                        const isOwn = msg.username === this.user.username;
                        this.addMessage({
                            id: msg.id,
                            username: msg.username,
                            message: msg.message,
                            time: this.formatTime(new Date(msg.timestamp || msg.date || Date.now())),
                            channel: msg.channel
                        }, isOwn, false);
                    }
                });
                
                this.scrollToBottom();
                this.showNotification(`Loaded ${sortedMessages.length} messages`);
            }
            
        } catch (error) {
            console.error('Load error:', error);
            this.addSystemMessage('Failed to load messages');
        }
    }

    async checkForNewMessages() {
        if (!this.user) return;

        try {
            // Use GET request instead of POST
            const response = await fetch(`${this.SCRIPT_URL}?action=load&channel=general&t=${Date.now()}`);
            
            if (!response.ok) return;
            
            const data = await response.json();
            
            if (data.success && data.messages) {
                // Get current message IDs
                const currentIds = new Set();
                this.elements.messagesContainer.querySelectorAll('.message').forEach(msg => {
                    const id = msg.id.replace('msg-', '');
                    if (id) currentIds.add(id);
                });
                
                // Check for new messages
                data.messages.forEach(msg => {
                    if (!currentIds.has(msg.id)) {
                        if (msg.channel === 'system') {
                            this.addSystemMessage(msg.message);
                        } else {
                            const isOwn = msg.username === this.user.username;
                            this.addMessage({
                                id: msg.id,
                                username: msg.username,
                                message: msg.message,
                                time: this.formatTime(new Date(msg.timestamp || msg.date || Date.now())),
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
        }, 2000);
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
        
        // Reload messages for new channel
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
            minute: '2-digit'
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
        }, 2000);
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
