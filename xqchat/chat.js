class DiscordChat {
    constructor() {
        this.SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyoYUoRPsMDO31zE3q5GZ2kwyrrHs8Uj5pKnAOiBJAuU9y5fs51olo3QtBNVND8d74T/exec';
        this.user = null;
        this.currentChannel = 'general';
        
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

    login() {
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
        this.addSystemMessage('All messages are saved to Google Sheets automatically.');
        
        // Send test message to verify
        this.sendToGoogleSheets({
            action: 'send',
            username: username,
            channel: 'system',
            message: `${username} joined the chat`
        });
    }

    sendMessage() {
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

        // Add to chat
        this.addMessage(message, true);
        
        // Clear input
        this.elements.messageInput.value = '';
        this.elements.sendButton.disabled = true;
        
        // Send to Google Sheets - CORRECT JSON FORMAT
        this.sendToGoogleSheets({
            action: 'send',
            username: this.user.username,
            channel: this.currentChannel,
            message: messageText
        });
        
        this.showNotification('Message sent ✓');
    }

    sendToGoogleSheets(data) {
        // METHOD 1: Direct fetch with JSON
        fetch(this.SCRIPT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            mode: 'no-cors', // Bypass CORS
            body: JSON.stringify(data)
        }).catch(() => {
            // If fetch fails, use form method
            this.sendViaForm(data);
        });
    }

    sendViaForm(data) {
        // METHOD 2: Form with JSON in textarea
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = this.SCRIPT_URL;
        form.target = 'hidden-frame';
        form.style.display = 'none';
        
        // Add JSON as raw text in textarea
        const textarea = document.createElement('textarea');
        textarea.name = 'postData';
        textarea.textContent = JSON.stringify(data);
        form.appendChild(textarea);
        
        // Submit
        document.body.appendChild(form);
        form.submit();
        
        setTimeout(() => {
            if (form.parentNode) {
                document.body.removeChild(form);
            }
        }, 100);
    }

    addMessage(message, isOwn = false) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message';
        
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
        
        this.addSystemMessage(`Switched to #${channel}`);
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
