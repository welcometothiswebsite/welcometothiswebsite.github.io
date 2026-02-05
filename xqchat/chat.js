// === FIXED REAL-TIME CHAT WITH DEBUG ===
class DiscordChat {
    constructor() {
        this.SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyoYUoRPsMDO31zE3q5GZ2kwyrrHs8Uj5pKnAOiBJAuU9y5fs51olo3QtBNVND8d74T/exec';
        this.user = null;
        this.currentChannel = 'general';
        this.refreshInterval = null;
        this.lastMessageTime = null;
        this.displayedMessageIds = new Set();
        this.debugMode = true; // Enable debug
        
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
        
        // Load initial messages
        await this.loadAllMessages();
        
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
            this.debugLog('Sent join message for:', username);
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
            this.debugLog('Message saved to sheets:', messageText.substring(0, 20));
            
        } catch (error) {
            this.showNotification('Failed to send', 'error');
            this.debugLog('Save error:', error.message);
        }
    }

    async sendToGoogleSheets(data) {
        return fetch(this.SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    }

    async loadAllMessages() {
        if (!this.user) return;

        try {
            this.debugLog('=== LOADING ALL MESSAGES ===');
            this.debugLog('Channel:', this.currentChannel);
            
            // Clear displayed message IDs
            this.displayedMessageIds.clear();
            
            // Try to load via API
            const response = await fetch(this.SCRIPT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'load',
                    channel: 'all'  // Load ALL messages including system
                })
            });
            
            this.debugLog('Response status:', response.status);
            
            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }
            
            const data = await response.json();
            this.debugLog('Response data:', data);
            
            if (data.success && data.messages) {
                // Clear all messages
                this.elements.messagesContainer.innerHTML = '';
                
                // Add welcome messages back
                this.addSystemMessage(`Welcome ${this.user.username}! 👋`);
                this.addSystemMessage('Chat refreshes every 5 seconds to show new messages.');
                
                this.debugLog('Total messages from server:', data.messages.length);
                
                // Sort messages by timestamp (newest first)
                const sortedMessages = [...data.messages].sort((a, b) => {
                    return new Date(b.timestamp) - new Date(a.timestamp);
                });
                
                // Get only recent messages (last 50)
                const recentMessages = sortedMessages.slice(0, 50);
                
                // Now sort for display (oldest first)
                const displayMessages = [...recentMessages].sort((a, b) => {
                    return new Date(a.timestamp) - new Date(b.timestamp);
                });
                
                this.debugLog('Displaying messages:', displayMessages.length);
                
                // Add messages to chat
                displayMessages.forEach(msg => {
                    this.addMessageFromServer(msg);
                });
                
                // Scroll to bottom
                this.scrollToBottom();
                
                this.showNotification(`Loaded ${displayMessages.length} messages`, 'success');
                this.debugLog('Loaded messages successfully');
                
            } else {
                this.addSystemMessage('No messages found or server error');
                this.debugLog('No messages in response');
            }
            
        } catch (error) {
            console.log('Load error:', error);
            this.debugLog('Load error:', error.message);
            this.addSystemMessage('Could not load messages');
        }
    }

    async checkForNewMessages() {
        if (!this.user) return;

        this.debugLog('=== CHECKING FOR NEW MESSAGES ===');
        this.debugLog('Time:', new Date().toLocaleTimeString());
        this.debugLog('Currently displayed IDs:', this.displayedMessageIds.size);
        
        try {
            const response = await fetch(this.SCRIPT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'load',
                    channel: 'all'  // Load ALL messages
                })
            });
            
            if (!response.ok) {
                this.debugLog('Fetch failed:', response.status);
                return;
            }
            
            const data = await response.json();
            
            if (data.success && data.messages) {
                this.debugLog('Server returned messages:', data.messages.length);
                
                let newCount = 0;
                
                // Check each message from server
                data.messages.forEach(msg => {
                    if (!this.displayedMessageIds.has(msg.id)) {
                        this.debugLog('New message found:', {
                            id: msg.id,
                            user: msg.username,
                            msg: msg.message.substring(0, 30)
                        });
                        
                        this.addMessageFromServer(msg);
                        newCount++;
                    }
                });
                
                if (newCount > 0) {
                    this.debugLog(`Added ${newCount} new messages`);
                    this.showNotification(`${newCount} new message${newCount > 1 ? 's' : ''}`);
                    
                    if (this.isAtBottom()) {
                        this.scrollToBottom();
                    }
                } else {
                    this.debugLog('No new messages found');
                }
                
            } else {
                this.debugLog('No messages in response');
            }
            
        } catch (error) {
            console.log('Check new messages error:', error);
            this.debugLog('Check error:', error.message);
        }
    }

    addMessageFromServer(msg) {
        // Track this message ID
        this.displayedMessageIds.add(msg.id);
        
        // Check if this is a system message
        if (msg.channel === 'system') {
            this.debugLog('Adding system message:', msg.message);
            this.addSystemMessage(msg.message);
        } else {
            // Regular message - only show if in current channel
            if (msg.channel === this.currentChannel) {
                const isOwn = msg.username === this.user.username;
                this.debugLog('Adding regular message:', {
                    user: msg.username,
                    channel: msg.channel,
                    isOwn: isOwn
                });
                
                this.addMessage({
                    id: msg.id,
                    username: msg.username,
                    message: msg.message,
                    time: this.formatTime(new Date(msg.timestamp || Date.now())),
                    channel: msg.channel
                }, isOwn, false);
            } else {
                this.debugLog('Skipping message - wrong channel:', {
                    msgChannel: msg.channel,
                    currentChannel: this.currentChannel
                });
            }
        }
    }

    isAtBottom() {
        const container = this.elements.messagesContainer;
        const isBottom = container.scrollHeight - container.clientHeight <= container.scrollTop + 50;
        this.debugLog('Is at bottom?', isBottom);
        return isBottom;
    }

    startAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
        
        this.debugLog('Starting auto-refresh every 5 seconds');
        
        // Check for new messages every 5 seconds
        this.refreshInterval = setInterval(() => {
            this.debugLog('Auto-refresh triggered');
            this.checkForNewMessages();
        }, 5000);
    }

    switchChannel(channel) {
        if (channel === this.currentChannel) return;
        
        this.debugLog('Switching channel to:', channel);
        
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
        this.loadAllMessages();
        
        this.addSystemMessage(`Switched to #${channel}`);
    }

    addMessage(message, isOwn = false, shouldScroll = true) {
        // Check if message already exists
        if (document.getElementById('msg-' + message.id)) {
            this.debugLog('Message already exists:', message.id);
            return;
        }
        
        this.debugLog('Adding message to DOM:', {
            id: message.id,
            user: message.username,
            isOwn: isOwn
        });
        
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
        this.debugLog('System message added:', text);
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
            this.debugLog('Scrolled to bottom');
        }, 100);
    }

    debugLog(message, data = null) {
        if (this.debugMode) {
            console.log('[DEBUG]', message, data || '');
            
            // Also show in notifications
            if (typeof message === 'string' && message.includes('===')) {
                // Show important debug info as notification
                this.showNotification(message.replace('===', '').trim(), 'warning');
            }
        }
    }

    showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = message;
        
        if (type === 'error') {
            notification.style.background = '#ed4245';
        } else if (type === 'warning') {
            notification.style.background = '#faa81a';
        } else if (type === 'info') {
            notification.style.background = '#5865f2';
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
