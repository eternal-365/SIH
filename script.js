

class EduMentorChat {
    constructor() {
        this.studentId = "S123"; // In real app, this would come from authentication
        this.apiBase = "http://localhost:3000/api";
        this.isLoading = false;
        
        this.initializeElements();
        this.attachEventListeners();
        this.loadChatHistory();
        this.setWelcomeTime();
    }
    
    initializeElements() {
        this.chatMessages = document.getElementById('chatMessages');
        this.userInput = document.getElementById('userInput');
        this.sendButton = document.getElementById('sendButton');
        this.typingIndicator = document.getElementById('typingIndicator');
        this.clearChatBtn = document.getElementById('clearChat');
        this.suggestionsBtn = document.getElementById('suggestionsButton');
        this.quickSuggestions = document.getElementById('quickSuggestions');
        this.charCount = document.getElementById('charCount');
        this.loadingSpinner = document.getElementById('loadingSpinner');
        this.statusIndicator = document.getElementById('status');
    }
    
    attachEventListeners() {
        this.sendButton.addEventListener('click', () => this.sendMessage());
        this.userInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        
        this.clearChatBtn.addEventListener('click', () => this.clearChat());
        this.suggestionsBtn.addEventListener('click', () => this.toggleSuggestions());
        
        // Quick suggestions
        document.querySelectorAll('.suggestion-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const question = e.target.getAttribute('data-question');
                this.userInput.value = question;
                this.sendMessage();
                this.hideSuggestions();
            });
        });
        
        // Character count
        this.userInput.addEventListener('input', () => this.updateCharCount());
        
        // Auto-resize input
        this.userInput.addEventListener('input', this.autoResizeInput.bind(this));
    }
    
    autoResizeInput() {
        this.userInput.style.height = 'auto';
        this.userInput.style.height = Math.min(this.userInput.scrollHeight, 120) + 'px';
    }
    
    updateCharCount() {
        const length = this.userInput.value.length;
        this.charCount.textContent = `${length}/500`;
        
        if (length > 450) {
            this.charCount.style.color = '#ef4444';
        } else if (length > 400) {
            this.charCount.style.color = '#f59e0b';
        } else {
            this.charCount.style.color = '#6b7280';
        }
    }
    
    setWelcomeTime() {
        const timeElement = document.getElementById('welcomeTime');
        timeElement.textContent = this.formatTime(new Date());
    }
    
    async sendMessage() {
        const message = this.userInput.value.trim();
        if (!message || this.isLoading) return;
        
        // Add user message to chat
        this.addMessage(message, 'user');
        this.userInput.value = '';
        this.updateCharCount();
        this.autoResizeInput();
        
        // Show typing indicator
        this.showTyping();
        
        try {
            this.isLoading = true;
            this.sendButton.disabled = true;
            
            const response = await fetch(`${this.apiBase}/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    studentId: this.studentId,
                    text: message,
                    messageId: this.generateMessageId()
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.addMessage(data.reply, 'bot', data.timestamp);
            } else {
                throw new Error(data.error);
            }
            
        } catch (error) {
            console.error('Error sending message:', error);
            this.addMessage(
                "I'm sorry, I'm having trouble connecting right now. Please try again in a moment.", 
                'bot'
            );
        } finally {
            this.hideTyping();
            this.isLoading = false;
            this.sendButton.disabled = false;
            this.userInput.focus();
        }
    }
    
    addMessage(content, role, timestamp = null) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}-message`;
        
        const avatarIcon = role === 'user' ? 'fas fa-user' : 'fas fa-robot';
        
        messageDiv.innerHTML = `
            <div class="message-avatar">
                <i class="${avatarIcon}"></i>
            </div>
            <div class="message-content">
                
                <div class="message-text">${marked.parse(content)}</div>

                
                <span class="message-time">${this.formatTime(timestamp || new Date())}</span>
            </div>
        `;
        
        this.chatMessages.appendChild(messageDiv);
        this.scrollToBottom();
    }
    
    showTyping() {
        this.typingIndicator.style.display = 'flex';
        this.scrollToBottom();
    }
    
    hideTyping() {
        this.typingIndicator.style.display = 'none';
    }
    
    scrollToBottom() {
        setTimeout(() => {
            this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
        }, 100);
    }
    
    async loadChatHistory() {
        try {
            this.showLoading();
            
            const response = await fetch(`${this.apiBase}/chat/history/${this.studentId}?limit=20`);
            const data = await response.json();
            
            if (data.success && data.history.length > 0) {
                // Clear welcome message
                document.querySelector('.welcome-message').style.display = 'none';
                
                // Add history messages
                data.history.forEach(msg => {
                    this.addMessage(msg.content, msg.role, new Date(msg.timestamp));
                });
            }
        } catch (error) {
            console.error('Error loading chat history:', error);
        } finally {
            this.hideLoading();
        }
    }
    
    clearChat() {
        if (!confirm('Are you sure you want to clear the conversation?')) return;
        
        // Keep only the welcome message
        const welcomeMessage = document.querySelector('.welcome-message');
        this.chatMessages.innerHTML = '';
        this.chatMessages.appendChild(welcomeMessage);
        welcomeMessage.style.display = 'block';
        
        // TODO: Also clear from server in a real application
    }
    
    toggleSuggestions() {
        if (this.quickSuggestions.style.display === 'flex') {
            this.hideSuggestions();
        } else {
            this.showSuggestions();
        }
    }
    
    showSuggestions() {
        this.quickSuggestions.style.display = 'flex';
        this.suggestionsBtn.innerHTML = '<i class="fas fa-times"></i>';
    }
    
    hideSuggestions() {
        this.quickSuggestions.style.display = 'none';
        this.suggestionsBtn.innerHTML = '<i class="fas fa-lightbulb"></i>';
    }
    
    showLoading() {
        this.loadingSpinner.style.display = 'flex';
    }
    
    hideLoading() {
        this.loadingSpinner.style.display = 'none';
    }
    
    generateMessageId() {
        return 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    
    formatTime(date) {
        if (!(date instanceof Date)) {
            date = new Date(date);
        }
        
        return date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize the chat when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new EduMentorChat();
});

// Service worker registration for offline capability (optional)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('SW registered: ', registration);
            })
            .catch(registrationError => {
                console.log('SW registration failed: ', registrationError);
            });
    });
}

