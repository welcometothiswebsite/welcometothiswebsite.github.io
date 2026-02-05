// === FIXED REAL-TIME CHAT - SHOW NEWEST MESSAGES ONLY ===
class DiscordChat {
    constructor() {
        this.SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyoYUoRPsMDO31zE3q5GZ2kwyrrHs8Uj5pKnAOiBJAuU9y5fs51olo3QtBNVND8d74T/exec';
        this.user = null;
        this.currentChannel = 'general';
        this.refreshInterval = null;
        this.lastMessageTime = null;
        this.displayedMessageIds = new Set(); // Track displayed message IDs
        this.MAX_MESSAGES = 50; // Show max 50 messages in chat
        
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
        this.addSystemMessage('Chat refreshes every 5 seconds to show new messages.');
        
        // Send "user joined" message to system channel
        await this.sendJoinMessage(username);
        
        // Load initial messages (newest 10)
        await this.loadInitialMessages();
        
        // Start auto-refresh
        this.startAutoRefresh();
    }

    async sendJoinMessage(username) {
        try {
            await this.sendToGoogleSheets({
                action: 'send',
                username: 'System',
                channel: 'system',
                message: `${username} joined the chat`
            });
        } catch (error) {
            console.log('Could not send join message:', error);
        }
    }

    async sendMessage() {
        if (!this.user) return;

        const messageText = this.elements.messageInput.value.trim();
        if (!messageText) return;

        // Create message
        const now = new Date();
        const message = {
            id: 'msg_' + Date.now(),
            username: this.user.username,
            message: messageText,
            time: this.formatTime(now),
            channel: this.currentChannel
        };

        // Add to chat immediately
        this.addMessage(message, true);
        
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
            this.lastMessageTime = Date.now();
            
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

    async loadInitialMessages() {
        if (!this.user) return;

        try {
            // Clear displayed message IDs
            this.displayedMessageIds.clear();
            
            // Try to load via API
            const response = await fetch(this.SCRIPT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'load',
                    channel: this.currentChannel
                })
            });
            
            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.success && data.messages) {
                // Clear all messages
                this.elements.messagesContainer.innerHTML = '';
                
                // Add welcome messages back
                this.addSystemMessage(`Welcome ${this.user.username}! 👋`);
                this.addSystemMessage('Chat refreshes every 5 seconds to show new messages.');
                
                // Get the NEWEST 10 messages (backend already returns newest first)
                const newestMessages = data.messages.slice(0, 20); // Get top 20 newest
                
                // Sort them by timestamp (oldest first for display)
                const sortedMessages = [...newestMessages].sort((a, b) => {
                    return new Date(a.timestamp) - new Date(b.timestamp);
                });
                
                // Add messages to chat
                sortedMessages.forEach(msg => {
                    this.processIncomingMessage(msg);
                });
                
                // Scroll to bottom
                this.scrollToBottom();
                
                this.showNotification(`Loaded ${newestMessages.length} messages`, 'success');
                
            } else {
                this.addSystemMessage('No messages found or server error');
            }
            
        } catch (error) {
            console.log('Load error:', error);
            this.addSystemMessage('Could not load messages');
        }
    }

    async checkForNewMessages() {
        if (!this.user) return;

        try {
            const response = await fetch(this.SCRIPT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'load',
                    channel: this.currentChannel
                })
            });
            
            if (!response.ok) return;
            
            const data = await response.json();
            
            if (data.success && data.messages && data.messages.length > 0) {
                // Get only the newest messages (first 10 from backend)
                const newestMessages = data.messages.slice(0, 10);
                
                let newCount = 0;
                newestMessages.forEach(msg => {
                    // Check if this message is already displayed
                    if (!this.displayedMessageIds.has(msg.id)) {
                        this.processIncomingMessage(msg);
                        newCount++;
                    }
                });
                
                // Remove old messages if we have too many
                this.limitMessagesDisplayed();
                
                if (newCount > 0 && this.isAtBottom()) {
                    this.scrollToBottom();
                }
            }
            
        } catch (error) {
            console.log('Check new messages error:', error);
        }
    }

    processIncomingMessage(msg) {
        // Check if this is a system message (channel = 'system')
        if (msg.channel === 'system') {
            // Display as system message
            this.addSystemMessage(msg.message);
        } else {
            // Regular message
            const isOwn = msg.username === this.user.username;
            this.addMessage({
                id: msg.id,
                username: msg.username,
                message: msg.message,
                time: this.formatTime(new Date(msg.timestamp || Date.now())),
                channel: msg.channel
            }, isOwn, false); // Don't scroll for each message
        }
        
        // Track this message ID
        this.displayedMessageIds.add(msg.id);
    }

    limitMessagesDisplayed() {
        const messages = this.elements.messagesContainer.querySelectorAll('.message');
        if (messages.length > this.MAX_MESSAGES) {
            // Remove oldest messages (skip system messages if needed)
            const toRemove = messages.length - this.MAX_MESSAGES;
            for (let i = 0; i < toRemove; i++) {
                const msg = messages[i];
                const id = msg.id.replace('msg-', '');
                if (id) {
                    this.displayedMessageIds.delete(id);
                }
                msg.remove();
            }
        }
    }

    isAtBottom() {
        const container = this.elements.messagesContainer;
        return container.scrollHeight - container.clientHeight <= container.scrollTop + 50;
    }

    startAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
        
        // Check for new messages every 5 seconds
        this.refreshInterval = setInterval(() => {
            this.checkForNewMessages();
        }, 5000);
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
        
        // Clear displayed messages for old channel
        this.displayedMessageIds.clear();
        this.elements.messagesContainer.innerHTML = '';
        
        // Load messages for new channel
        this.loadInitialMessages();
        
        this.addSystemMessage(`Switched to #${channel}`);
    }

    addMessage(message, isOwn = false, shouldScroll = true) {
        // Check if message already exists
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

        // Append to container (new messages go to bottom)
        this.elements.messagesContainer.appendChild(messageDiv);
        
        // Only auto-scroll if at bottom and shouldScroll is true
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
