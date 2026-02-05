// === REAL-TIME CHAT WITH AUTO-REFRESH ===
class DiscordChat {
    constructor() {
        this.SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyoYUoRPsMDO31zE3q5GZ2kwyrrHs8Uj5pKnAOiBJAuU9y5fs51olo3QtBNVND8d74T/exec';
        this.user = null;
        this.currentChannel = 'general';
        this.lastMessageId = null;
        this.refreshInterval = null;
        this.messageCache = new Set(); // Track displayed messages
        
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
        // Login
        this.elements.loginButton.addEventListener('click', () => this.login());
        this.elements.usernameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.login();
        });

        // Message input
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

        // Channel switching
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

        if (username.length > 20) {
            this.showNotification('Username too long (max 20 characters)', 'error');
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
        this.addSystemMessage('Chat refreshes every 3 seconds to show new messages.');
        
        // Load initial messages
        await this.loadMessages();
        
        // Start auto-refresh
        this.startAutoRefresh();
        
        // Send join notification
        this.sendToGoogleSheets({
            action: 'send',
            username: username,
            channel: 'system',
            message: `${username} joined the chat`
        });
    }

    async sendMessage() {
        if (!this.user) return;

        const messageText = this.elements.messageInput.value.trim();
        if (!messageText) return;

        // Create message
        const now = new Date();
        const messageId = 'msg_' + Date.now();
        const message = {
            id: messageId,
            username: this.user.username,
            message: messageText,
            time: this.formatTime(now),
            channel: this.currentChannel
        };

        // Add to chat immediately (optimistic update)
        this.addMessage(message, true);
        this.messageCache.add(messageId);
        this.lastMessageId = messageId;
        
        // Clear input
        this.elements.messageInput.value = '';
        this.elements.sendButton.disabled = true;
        
        // Save to Google Sheets
        try {
            await this.sendToGoogleSheets({
                action: 'send',
                username: this.user.username,
                channel: this.currentChannel,
                message: messageText
            });
            
            this.showNotification('Message sent ✓');
            
        } catch (error) {
            this.showNotification('Failed to send', 'error');
        }
    }

    async sendToGoogleSheets(data) {
        return fetch(this.SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    }

    async loadMessages() {
        if (!this.user) return;

        try {
            // Load messages from Google Sheets
            const response = await fetch(this.SCRIPT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'load',
                    channel: this.currentChannel
                })
            });
            
            const data = await response.json();
            
            if (data.success && data.messages) {
                // Clear chat but keep system messages
                const systemMessages = Array.from(this.elements.messagesContainer.children)
                    .filter(el => el.querySelector('.message-author')?.textContent === 'System');
                
                this.elements.messagesContainer.innerHTML = '';
                systemMessages.forEach(msg => this.elements.messagesContainer.appendChild(msg));
                
                // Add all messages from server
                let foundLastMessage = false;
                data.messages.forEach(msg => {
                    if (!this.messageCache.has(msg.id)) {
                        const isOwn = msg.username === this.user.username;
                        this.addMessage({
                            id: msg.id,
                            username: msg.username,
                            message: msg.message,
                            time: this.formatTime(new Date(msg.timestamp)),
                            channel: msg.channel
                        }, isOwn);
                        this.messageCache.add(msg.id);
                        
                        if (!this.lastMessageId) {
                            this.lastMessageId = msg.id;
                        }
                    }
                    
                    if (msg.id === this.lastMessageId) {
                        foundLastMessage = true;
                    }
                });
                
                // Update last message ID if we didn't find it (new channel)
                if (!foundLastMessage && data.messages.length > 0) {
                    this.lastMessageId = data.messages[0].id;
                }
                
                this.scrollToBottom();
            }
            
        } catch (error) {
            console.log('Load error:', error);
        }
    }

    async checkForNewMessages() {
        if (!this.user || !this.lastMessageId) return;

        try {
            const response = await fetch(this.SCRIPT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'load',
                    channel: this.currentChannel,
                    since: this.lastMessageId
                })
            });
            
            const data = await response.json();
            
            if (data.success && data.messages && data.messages.length > 0) {
                let newMessages = false;
                
                // Check if there are messages newer than our last known
                for (const msg of data.messages) {
                    if (!this.messageCache.has(msg.id)) {
                        const isOwn = msg.username === this.user.username;
                        this.addMessage({
                            id: msg.id,
                            username: msg.username,
                            message: msg.message,
                            time: this.formatTime(new Date(msg.timestamp)),
                            channel: msg.channel
                        }, isOwn);
                        this.messageCache.add(msg.id);
                        newMessages = true;
                        
                        // Update last message ID
                        this.lastMessageId = msg.id;
                    }
                }
                
                if (newMessages) {
                    this.scrollToBottom();
                }
            }
            
        } catch (error) {
            console.log('Check new messages error:', error);
        }
    }

    startAutoRefresh() {
        // Clear existing interval
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
        
        // Check for new messages every 3 seconds
        this.refreshInterval = setInterval(() => {
            this.checkForNewMessages();
        }, 3000);
        
        console.log('Auto-refresh started: checking every 3 seconds');
    }

    stopAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
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
        
        // Clear message cache for new channel
        this.messageCache.clear();
        this.lastMessageId = null;
        
        // Load messages for new channel
        this.loadMessages();
        
        this.addSystemMessage(`Switched to #${channel}`);
    }

    addMessage(message, isOwn = false) {
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
        this.scrollToBottom();
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
        this.scrollToBottom();
    }

    formatTime(date) {
        return date.toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    }

    scrollToBottom() {
        setTimeout(() => {
            this.elements.messagesContainer.scrollTop = this.elements.messagesContainer.scrollHeight;
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
