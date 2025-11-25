(function() {
    const vscode = acquireVsCodeApi();
    const state = vscode.getState() || {
        chatHistory: [],
        activePanel: 'chat',
        selectedFile: '',
        projectFiles: []
    };

    function escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function initialize() {
        setupEventListeners();
        restoreState();
        vscode.postMessage({ command: 'refresh' });
        vscode.postMessage({ command: 'getProjectFiles' });
    }

    function restoreState() {
        if (state.activePanel) {
            setActivePanel(state.activePanel);
        }
        renderChatHistory();
        
        if (state.selectedFile) {
            const fileSelector = document.getElementById('file-selector');
            if (fileSelector) {
                fileSelector.value = state.selectedFile;
            }
        }
    }

    // Add this function to sidebar-script.js
    function formatFunctionSearchResults(data) {
        let html = '';
        
        if (data.summary) {
            html += '<div class="analysis-summary">' + escapeHtml(data.summary) + '</div>';
        }
        
        if (data.query) {
            html += '<div class="analysis-summary" style="background: var(--vscode-textBlockQuote-background); margin-bottom: 16px;">' +
                   '<strong>Your Query:</strong> ' + escapeHtml(data.query) + 
                   '</div>';
        }
        
        if (data.results && data.results.length > 0) {
            html += '<div class="function-results">';
            data.results.forEach((result, index) => {
                const escapedFilePath = escapeHtml(result.filePath);
                const escapedFileName = escapeHtml(result.fileName);
                const language = result.language || 'unknown';
                const languageIcon = getLanguageIcon(language);
                const score = result.relevanceScore ?? result.confidence;
                const confidence = typeof score === 'number' ? Math.round(score * 100) + '% match' : (score || 'High relevance');
                const functionType = result.functionType || 'function';
                
                html += '<div class="function-result-item">' +
                    '<div class="function-result-header">' +
                    '<div class="file-info">' +
                    '<div class="file-icon" title="' + language + '">' + languageIcon + '</div>' +
                    '<div class="file-details">' +
                    '<div class="file-name" title="' + escapedFileName + '">' + escapedFileName + '</div>' +
                    '<div class="file-path" title="' + escapedFilePath + '">' + escapedFilePath + '</div>' +
                    '</div>' +
                    '</div>' +
                    '<div class="confidence-badge">' + confidence + '</div>' +
                    '</div>' +
                    '<div class="function-details">' +
                    '<div class="function-name"><strong>' + escapeHtml(functionType) + ':</strong> <code>' + escapeHtml(result.functionName) + '</code></div>' +
                    '</div>';
                
                if (result.explanation) {
                    html += '<div class="analysis-summary" style="margin-bottom: 12px; font-size: 12px; background: var(--vscode-textBlockQuote-background);">' +
                           '<strong>Why it matches:</strong> ' + escapeHtml(result.explanation) +
                           '</div>';
                }
                
                if (result.codeSnippet) {
                    html += '<div class="code-snippet-preview">' +
                        '<div class="snippet-header">Function Code:</div>' +
                        '<pre class="code-snippet"><code>' + escapeHtml(result.codeSnippet) + '</code></pre>' +
                        '</div>';
                }
                
                html += '<div class="action-buttons">' +
                    '<button class="btn primary open-at-line code-snippet-link" ' +
                    'data-file-path="' + escapedFilePath + '" ' +
                    'data-line-number="' + result.lineNumber + '">' +
                    '📝 Open Function at Line ' + result.lineNumber +
                    '</button>' +
                    '<button class="btn open-file-btn" data-file-path="' + escapedFilePath + '">📂 Open File</button>' +
                    '</div>' +
                    '</div>';
            });
            html += '</div>';
        } else {
            html += '<div class="empty-state"><div class="icon">🔍</div><div class="message">No functions found matching your description. Try using different words to describe what the function should do.</div></div>';
        }
        
        return html;
    }

    // Unified extension message handler (single definition)
    function handleExtensionMessage(msg) {
        console.log('Received message:', msg);

        // Hide spinners and enable buttons
        document.querySelectorAll('.spinner').forEach(spinner => {
            spinner.classList.add('hidden');
        });
        document.querySelectorAll('.btn').forEach(btn => {
            btn.disabled = false;
        });

        if (msg.type === 'clearChat') {
            state.chatHistory = [];
            vscode.setState(state);
            renderChatHistory();
            return;
        }

        if (msg.type === 'aiOutput') {
            const title = msg.title || '';
            const content = msg.content;
            const source = msg.source || 'command';
            const action = msg.action || '';
            
            state.lastResults = state.lastResults || {};
            state.lastResults[title] = content;
            vscode.setState(state);

            // Handle function search results specifically
            if (content && content.type === 'functionSearchResults') {
                renderFunctionSearchResults('search-results', content);
                setActivePanel('search');
                return;
            }

            // Route based on the specific action/command that generated the output
            routeToCorrectPanel(msg, title, content, action);
        } else if (msg.type === 'previewData') {
            const combined = 'Original:\n\n' + msg.original + '\n\n== Refactored ==\n\n' + msg.modified;
            renderResults('analyze-results', 'Code Preview', combined);
            setActivePanel('analyze');
        } else if (msg.type === 'projectFiles') {
            state.projectFiles = msg.files || [];
            vscode.setState(state);
            updateFileSelector(state.projectFiles);
        }
    }

    // Add this new rendering function
    function renderFunctionSearchResults(containerId, data) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        const resultsContent = container.querySelector('.results-content');
        const resultsTitle = container.querySelector('.results-title');
        
        if (resultsTitle) {
            resultsTitle.textContent = data.title || 'Function Search Results';
        }

        if (!resultsContent) return;

        const formattedContent = formatFunctionSearchResults(data);
        resultsContent.innerHTML = formattedContent;

        // Add click handlers for open buttons
        resultsContent.querySelectorAll('.open-file-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const filePath = btn.getAttribute('data-file-path');
                vscode.postMessage({ command: 'openFile', path: filePath });
            });
        });

        resultsContent.querySelectorAll('.open-at-line').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const filePath = btn.getAttribute('data-file-path');
                const lineNumber = btn.getAttribute('data-line-number');
                vscode.postMessage({ 
                    command: 'openFileAtLine', 
                    path: filePath, 
                    line: parseInt(lineNumber) 
                });
            });
        });
    }

    function setupEventListeners() {
        // Tab switching
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                e.preventDefault();
                const panelId = tab.getAttribute('data-panel');
                if (panelId) {
                    setActivePanel(panelId);
                }
            });
        });

        // File selector
        const fileSelector = document.getElementById('file-selector');
        if (fileSelector) {
            fileSelector.addEventListener('change', (e) => {
                state.selectedFile = e.target.value;
                vscode.setState(state);
            });
        }

        // Chat functionality
        const sendButton = document.getElementById('send-message');
        const chatInput = document.getElementById('chat-input');
        const clearButton = document.getElementById('clear-chat');

        if (sendButton) {
            sendButton.addEventListener('click', () => sendMessage('chat'));
        }
        
        if (chatInput) {
            chatInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    sendMessage('chat');
                    e.preventDefault();
                }
            });
        }

        if (clearButton) {
            clearButton.addEventListener('click', () => {
                vscode.postMessage({ command: 'clearChat' });
            });
        }

        // Analysis cards
        document.querySelectorAll('.analysis-card').forEach(card => {
            card.addEventListener('click', () => {
                const action = card.getAttribute('data-action');
                const scope = card.getAttribute('data-scope');
                if (action === 'analyzeProject') {
                    analyzeProject(scope);
                }
            });
        });

        setupButtonListeners();

        window.addEventListener('message', event => {
            const msg = event.data;
            handleExtensionMessage(msg);
        });
    }

    function getSelectedFilePath() {
        const fileSelector = document.getElementById('file-selector');
        if (!fileSelector) return undefined;
        
        const selectedValue = fileSelector.value;
        // Keep previous behavior: empty string => auto-detect current file
        if (selectedValue === 'project') {
            return 'project';
        }
        if (!selectedValue) {
            return undefined;
        }
        // Return the selected file path
        return selectedValue;
    }

    function setupButtonListeners() {
        // Analyze buttons
        const analyzeRun = document.getElementById('analyze-run');
        const searchRun = document.getElementById('search-run');
        const buildIndex = document.getElementById('build-index');
        const langRun = document.getElementById('lang-run');
        const semanticSearchRun = document.getElementById('semantic-search-run');

        if (analyzeRun) {
            analyzeRun.addEventListener('click', () => {
                const code = document.getElementById('analyze-code')?.value || '';
                if (!code.trim()) {
                    showNotification('Please enter code to analyze', 'warning');
                    return;
                }
                const filePath = getSelectedFilePath();
                sendMessage('deepAnalysis', { code, path: filePath });
            });
        }

        if (searchRun) {
            searchRun.addEventListener('click', () => {
                const query = document.getElementById('search-query')?.value || '';
                if (!query.trim()) {
                    showNotification('Please enter a search query', 'warning');
                    return;
                }
                sendMessage('searchProject', { query });
            });
        }

        if (buildIndex) {
            buildIndex.addEventListener('click', () => {
                vscode.postMessage({ command: 'run', action: 'buildSearchIndex' });
            });
        }

        if (langRun) {
            langRun.addEventListener('click', () => {
                const language = document.getElementById('lang-select')?.value || '';
                if (!language) {
                    showNotification('Please select a language', 'warning');
                    return;
                }
                sendMessage('searchByLanguage', { language });
            });
        }

        if (semanticSearchRun) {
            semanticSearchRun.addEventListener('click', () => {
                const query = document.getElementById('semantic-search-query')?.value || '';
                if (!query.trim()) {
                    showNotification('Please describe what code you\'re looking for', 'warning');
                    return;
                }
                // Use the semantic search action and pass the query payload
                sendMessage('semanticSearch', { query });
            });
        }

        // Copy buttons
        document.addEventListener('click', (e) => {
            if (e.target.classList && e.target.classList.contains('copy-btn')) {
                const container = e.target.closest('.results-container');
                if (container) {
                    const content = container.querySelector('.results-content');
                    if (content) {
                        const text = content.innerText || content.textContent;
                        navigator.clipboard.writeText(text).then(() => {
                            const original = e.target.innerHTML;
                            e.target.innerHTML = '✓';
                            setTimeout(() => {
                                e.target.innerHTML = original;
                            }, 2000);
                        });
                    }
                }
            }
        });

        // Code snippet click handlers
        document.addEventListener('click', (e) => {
            if (e.target.classList && e.target.classList.contains('code-snippet-link')) {
                e.preventDefault();
                const filePath = e.target.getAttribute('data-file-path');
                const lineNumber = e.target.getAttribute('data-line-number');
                vscode.postMessage({ 
                    command: 'openFileAtLine', 
                    path: filePath, 
                    line: parseInt(lineNumber) 
                });
            }
        });
    }

    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        const backgroundColor = type === 'warning' 
            ? 'var(--vscode-inputValidation-warningBackground)' 
            : 'var(--vscode-inputValidation-infoBackground)';
        const borderColor = type === 'warning'
            ? 'var(--vscode-inputValidation-warningBorder)'
            : 'var(--vscode-inputValidation-infoBorder)';
        
        notification.style.cssText = [
            'position: fixed;',
            'top: 20px;',
            'right: 20px;',
            'padding: 12px 16px;',
            'background: ' + backgroundColor + ';',
            'border: 1px solid ' + borderColor + ';',
            'border-radius: 4px;',
            'color: var(--vscode-input-foreground);',
            'font-size: 12px;',
            'z-index: 1000;',
            'max-width: 300px;'
        ].join(' ');
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 3000);
    }

    function setActivePanel(panelId) {
        document.querySelectorAll('.panel').forEach(panel => {
            panel.classList.remove('active');
        });
        
        document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.remove('active');
        });

        const activePanel = document.getElementById(panelId);
        const activeTab = document.querySelector('[data-panel="' + panelId + '"]');
        
        if (activePanel) {
            activePanel.classList.add('active');
        }
        if (activeTab) {
            activeTab.classList.add('active');
        }

        state.activePanel = panelId;
        vscode.setState(state);
    }

    function renderChatHistory() {
        const chatMessages = document.getElementById('chat-messages');
        if (!chatMessages) return;
        
        chatMessages.innerHTML = '';
        state.chatHistory.forEach(msg => {
            addMessage(msg.role, msg.content, false);
        });
        
        if (state.chatHistory.length === 0) {
            addMessage('system', '<strong>Welcome to VS AI Assistant!</strong><br>I can help you analyze code, find issues, and answer questions about your project.');
        }
    }

    function addMessage(role, content, saveToHistory = true) {
        const chatMessages = document.getElementById('chat-messages');
        if (!chatMessages) return;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message ' + role;
        
        let formattedContent = formatContent(content);
        
        const messageHeader = document.createElement('div');
        messageHeader.className = 'message-header';
        
        if (role === 'user') {
            messageHeader.innerHTML = '<span class="message-icon">👤</span><span>You</span>';
        } else if (role === 'assistant') {
            messageHeader.innerHTML = '<span class="message-icon">🤖</span><span>AI Assistant</span>';
        } else {
            messageHeader.innerHTML = '<span class="message-icon">🤖</span><span>VS AI Assistant</span>';
        }
        
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        messageContent.innerHTML = formattedContent;
        
        messageDiv.appendChild(messageHeader);
        messageDiv.appendChild(messageContent);
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        if (saveToHistory && role !== 'system') {
            state.chatHistory.push({ role, content });
            vscode.setState(state);
        }
    }

    function formatContent(content) {
        if (typeof content !== 'string') {
            return formatObjectContent(content);
        }

        // Handle markdown formatting
        let formatted = escapeHtml(content);

        // Process code blocks first (before other formatting)
        formatted = formatted.replace(/```(\w+)?\n([\s\S]*?)```/g, function(match, lang, code) {
            const language = lang || 'text';
            return '<div class="code-block-container"><div class="code-header">' + 
                   escapeHtml(language) + 
                   '</div><pre class="code-block"><code>' + 
                   escapeHtml(code.trim()) + 
                   '</code></pre></div>';
        });

        // Process inline code
        formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');

        // Process headers
        formatted = formatted.replace(/^### (.*$)/gim, '<h3>$1</h3>');
        formatted = formatted.replace(/^## (.*$)/gim, '<h2>$1</h2>');
        formatted = formatted.replace(/^# (.*$)/gim, '<h1>$1</h1>');

        // Process bold and italic
        formatted = formatted.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
        formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');

        // Process lists
        formatted = formatted.replace(/^- (.*$)/gim, '<li>$1</li>');
        formatted = formatted.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

        // Process line breaks and paragraphs
        formatted = formatted.replace(/\n\n/g, '</p><p>');
        formatted = formatted.replace(/\n/g, '<br>');

        // Wrap in paragraph if no block elements
        if (!formatted.includes('<div') && !formatted.includes('<pre') && !formatted.includes('<h') && !formatted.includes('<ul') && !formatted.includes('<ol')) {
            formatted = '<p>' + formatted + '</p>';
        }

        return formatted;
    }

    function formatObjectContent(obj) {
        if (obj && typeof obj === 'object') {
            if (obj.files && Array.isArray(obj.files)) {
                return formatFileList(obj);
            }
            if (obj.type === 'semanticSearchResults') {
                return formatSemanticSearchResults(obj);
            }
            if (obj.type === 'codeUnderstandingResults') {
                return formatCodeUnderstandingResults(obj);
            }
            return '<pre class="json-output">' + escapeHtml(JSON.stringify(obj, null, 2)) + '</pre>';
        }
        return escapeHtml(String(obj));
    }

    function formatFileList(data) {
        let html = '';
        
        if (data.summary) {
            html += '<div class="analysis-summary">' + escapeHtml(data.summary) + '</div>';
        }
        
        if (data.files && data.files.length > 0) {
            html += '<div class="file-list">';
            data.files.forEach(file => {
                const escapedFilePath = escapeHtml(file.filePath);
                const escapedFileName = escapeHtml(file.fileName);
                const language = file.language || 'unknown';
                const languageIcon = getLanguageIcon(language);
                const lineCount = file.lineCount || 0;
                
                html += '<div class="file-item" data-file-path="' + escapedFilePath + '">' +
                    '<div class="file-icon" title="' + language + '">' + languageIcon + '</div>' +
                    '<div class="file-content">' +
                    '<div class="file-name" title="' + escapedFileName + '">' + escapedFileName + '</div>' +
                    '<div class="file-path" title="' + escapedFilePath + '">' + escapedFilePath + '</div>' +
                    '<div class="file-meta">' + language + ' • ' + lineCount + ' lines</div>' +
                    '</div>' +
                    '<div class="file-actions">' +
                    '<button class="file-action open-file" data-file-path="' + escapedFilePath + '" title="Open file">📂</button>' +
                    '</div>' +
                    '</div>';
            });
            html += '</div>';
        } else {
            html += '<div class="empty-state"><div class="icon">📭</div><div class="message">No files found</div></div>';
        }
        
        return html;
    }

    function formatSemanticSearchResults(data) {
        let html = '';
        
        if (data.summary) {
            html += '<div class="analysis-summary">' + escapeHtml(data.summary) + '</div>';
        }
        
        if (data.results && data.results.length > 0) {
            html += '<div class="semantic-results">';
            data.results.forEach((result, index) => {
                const escapedFilePath = escapeHtml(result.filePath);
                const escapedFileName = escapeHtml(result.fileName);
                const language = result.language || 'unknown';
                const languageIcon = getLanguageIcon(language);
                const score = result.relevanceScore ?? result.confidence;
                const confidence = typeof score === 'number' ? Math.round(score * 100) + '% match' : (score || 'High relevance');
                
                html += '<div class="semantic-result-item">' +
                    '<div class="semantic-result-header">' +
                    '<div class="file-info">' +
                    '<div class="file-icon" title="' + language + '">' + languageIcon + '</div>' +
                    '<div class="file-details">' +
                    '<div class="file-name" title="' + escapedFileName + '">' + escapedFileName + '</div>' +
                    '<div class="file-path" title="' + escapedFilePath + '">' + escapedFilePath + '</div>' +
                    '</div>' +
                    '</div>' +
                    '<div class="confidence-badge">' + confidence + '</div>' +
                    '</div>';
                
                if (result.functionName) {
                    html += '<div class="function-info">' +
                        '<strong>Function:</strong> <code>' + escapeHtml(result.functionName) + '</code>' +
                        '</div>';
                }
                
                if (result.codeSnippet) {
                    html += '<div class="code-snippet-preview">' +
                        '<div class="snippet-header">Code Preview:</div>' +
                        '<pre class="code-snippet"><code>' + escapeHtml(result.codeSnippet) + '</code></pre>' +
                        '</div>';
                }
                
                if (result.lineNumber) {
                    html += '<div class="action-buttons">' +
                        '<button class="btn primary open-at-line code-snippet-link" ' +
                        'data-file-path="' + escapedFilePath + '" ' +
                        'data-line-number="' + result.lineNumber + '">' +
                        '📝 Open at Line ' + result.lineNumber +
                        '</button>' +
                        '<button class="btn open-file-btn" data-file-path="' + escapedFilePath + '">📂 Open File</button>' +
                        '</div>';
                } else {
                    html += '<div class="action-buttons">' +
                        '<button class="btn primary open-file-btn" data-file-path="' + escapedFilePath + '">📂 Open File</button>' +
                        '</div>';
                }
                
                html += '</div>';
            });
            html += '</div>';
        } else {
            html += '<div class="empty-state"><div class="icon">🔍</div><div class="message">No matching code found for your query</div></div>';
        }
        
        return html;
    }

    function formatCodeUnderstandingResults(data) {
        let html = '';
        
        if (data.summary) {
            html += '<div class="analysis-summary">' + escapeHtml(data.summary) + '</div>';
        }
        
        if (data.query) {
            html += '<div class="analysis-summary" style="background: var(--vscode-textBlockQuote-background); margin-bottom: 16px;">' +
                   '<strong>Your Query:</strong> ' + escapeHtml(data.query) + 
                   '</div>';
        }
        
        // Show intent analysis if available
        if (data.intent) {
            html += '<div class="analysis-summary" style="background: var(--vscode-badge-background); margin-bottom: 16px; font-size: 12px;">' +
                   '<strong>AI Understanding:</strong> ' +
                   'Searching for ' + escapeHtml(data.intent.searchType) + ' in ' + 
                   escapeHtml(data.intent.language) + ' code' +
                   (data.intent.concepts && data.intent.concepts.length > 0 ? ' • Concepts: ' + escapeHtml(data.intent.concepts.join(', ')) : '') +
                   '</div>';
        }
        
        if (data.results && data.results.length > 0) {
            html += '<div class="semantic-results">';
            data.results.forEach((result, index) => {
                const escapedFilePath = escapeHtml(result.filePath);
                const escapedFileName = escapeHtml(result.fileName);
                const language = result.language || 'unknown';
                const languageIcon = getLanguageIcon(language);
                const score = result.relevanceScore ?? result.confidence;
                const confidence = typeof score === 'number' ? Math.round(score * 100) + '% relevant' : (score || 'Relevant match');
                const functionName = result.functionName || 'main';
                
                html += '<div class="semantic-result-item">' +
                    '<div class="semantic-result-header">' +
                    '<div class="file-info">' +
                    '<div class="file-icon" title="' + language + '">' + languageIcon + '</div>' +
                    '<div class="file-details">' +
                    '<div class="file-name" title="' + escapedFileName + '">' + escapedFileName + '</div>' +
                    '<div class="file-path" title="' + escapedFilePath + '">' + escapedFilePath + '</div>' +
                    '</div>' +
                    '</div>' +
                    '<div class="confidence-badge">' + confidence + '</div>' +
                    '</div>';
                
                if (result.functionName && result.functionName !== 'main') {
                    html += '<div class="function-info">' +
                        '<strong>Function/Class:</strong> <code>' + escapeHtml(result.functionName) + '</code>' +
                        '</div>';
                }
                
                if (result.explanation) {
                    html += '<div class="analysis-summary" style="margin-bottom: 12px; font-size: 12px; background: var(--vscode-textBlockQuote-background);">' +
                           '<strong>Why it matches:</strong> ' + escapeHtml(result.explanation) +
                           '</div>';
                }
                
                if (result.codeSnippet) {
                    html += '<div class="code-snippet-preview">' +
                        '<div class="snippet-header">Matching Code:</div>' +
                        '<pre class="code-snippet"><code>' + escapeHtml(result.codeSnippet) + '</code></pre>' +
                        '</div>';
                }
                
                if (result.lineNumber) {
                    html += '<div class="action-buttons">' +
                        '<button class="btn primary open-at-line code-snippet-link" ' +
                        'data-file-path="' + escapedFilePath + '" ' +
                        'data-line-number="' + result.lineNumber + '">' +
                        '📝 Open at Line ' + result.lineNumber +
                        '</button>' +
                        '<button class="btn open-file-btn" data-file-path="' + escapedFilePath + '">📂 Open File</button>' +
                        '</div>';
                } else {
                    html += '<div class="action-buttons">' +
                        '<button class="btn primary open-file-btn" data-file-path="' + escapedFilePath + '">📂 Open File</button>' +
                        '</div>';
                }
                
                html += '</div>';
            });
            html += '</div>';
        } else {
            html += '<div class="empty-state"><div class="icon">🔍</div><div class="message">No code found matching your description. Try using different words to describe what you\'re looking for.</div></div>';
        }
        
        return html;
    }

    function getLanguageIcon(language) {
        const languageIcons = {
            'typescript': '📘',
            'javascript': '📙',
            'python': '🐍',
            'java': '☕',
            'css': '🎨',
            'html': '🌐',
            'markdown': '📝',
            'json': '📋',
            'xml': '📄'
        };
        return languageIcons[(language || '').toLowerCase()] || '📄';
    }

    function sendMessage(action, payload = {}) {
        const message = document.getElementById('chat-input')?.value.trim() || '';
        
        if (action === 'chat' && !message) {
            showNotification('Please enter a message', 'warning');
            return;
        }

        if (action === 'chat') {
            addMessage('user', message);
            const chatInput = document.getElementById('chat-input');
            if (chatInput) {
                chatInput.value = '';
            }
        }

        // Show spinner
        const spinner = document.getElementById(action + '-spinner') || 
                       document.getElementById('chat-spinner') ||
                       document.getElementById('analyze-spinner') ||
                       document.getElementById('search-spinner');
        if (spinner) spinner.classList.remove('hidden');

        // Disable button
        const button = document.getElementById(action + '-run') || document.getElementById('send-message');
        if (button) button.disabled = true;

        vscode.postMessage({
            command: 'run',
            action: action,
            payload: action === 'chat' ? { message } : payload
        });
    }

    function analyzeProject(scope = 'full') {
        const spinner = document.getElementById('analyze-spinner');
        if (spinner) spinner.classList.remove('hidden');

        vscode.postMessage({
            command: 'analyzeProject',
            scope: scope
        });
    }

    function routeToCorrectPanel(msg, title, content, action) {
        // Handle chat responses specifically
        if (action === 'chat' || (msg && msg.action === 'chat')) {
            addMessage('assistant', (typeof content === 'string' ? content : JSON.stringify(content)));
            setActivePanel('chat');
            return;
        }

        // Handle different content types
        if (msg.contentType === 'object') {
            handleStructuredContent(content, title, action);
        } else {
            handleTextContent(content, title, action);
        }
    }

    function handleStructuredContent(content, title, action) {
        if (!content) {
            renderResults('analyze-results', title, 'No content returned');
            setActivePanel('analyze');
            return;
        }

        if (content.type === 'fileList' || (content.files && Array.isArray(content.files))) {
            // Route file lists to search panel for search actions, analyze panel for analysis
            if (action === 'searchProject' || action === 'searchByLanguage' || 
                action === 'codeUnderstandingSearch' || action === 'semanticSearch') {
                renderFileListResults('search-results', content);
                setActivePanel('search');
            } else {
                renderFileListResults('analyze-results', content);
                setActivePanel('analyze');
            }
        } else if (content.type === 'semanticSearchResults') {
            renderSemanticSearchResults('search-results', content);
            setActivePanel('search');
        } else if (content.type === 'codeUnderstandingResults') {
            renderCodeUnderstandingResults('search-results', content);
            setActivePanel('search');
        } else if (content.type === 'functionSearchResults') {
            renderFunctionSearchResults('search-results', content);
            setActivePanel('search');
        } else {
            // Fallback to analyze panel for other object types
            renderResults('analyze-results', title, JSON.stringify(content, null, 2));
            setActivePanel('analyze');
        }
    }

    function handleTextContent(content, title, action) {
        // Explicit routing based on action type
        switch (action) {
            // Analysis actions -> analyze panel
            case 'explainCode':
            case 'findBugs':
            case 'suggestImprovements':
            case 'deepAnalysis':
            case 'analyzeProject':
            case 'findBugsInProject':
            case 'generateProjectSummary':
            case 'summarizeFile':
                renderResults('analyze-results', title, content);
                setActivePanel('analyze');
                break;
                
            // Search actions -> search panel
            case 'searchProject':
            case 'searchByLanguage':
            case 'buildSearchIndex':
            case 'codeUnderstandingSearch':
            case 'semanticSearch':
                renderResults('search-results', title, content);
                setActivePanel('search');
                break;
                
            // Default fallback based on title/content analysis
            default:
                const lowerTitle = (title || '').toLowerCase();
                const lowerContent = (typeof content === 'string' ? content.toLowerCase() : '');
                
                if (lowerTitle.includes('search') || lowerTitle.includes('result') || 
                    lowerContent.includes('search') || lowerContent.includes('found') ||
                    lowerContent.includes('matches')) {
                    renderResults('search-results', title, content);
                    setActivePanel('search');
                } else if (lowerTitle.includes('analysis') || lowerTitle.includes('bug') || 
                           lowerTitle.includes('explain') || lowerTitle.includes('summary') ||
                           lowerTitle.includes('improvement') || lowerTitle.includes('project') ||
                           lowerContent.includes('analysis') || lowerContent.includes('bug') ||
                           lowerContent.includes('suggest')) {
                    renderResults('analyze-results', title, content);
                    setActivePanel('analyze');
                } else {
                    // Default to analyze panel
                    renderResults('analyze-results', title, content);
                    setActivePanel('analyze');
                }
        }
    }

    // Render and helper functions continued (unchanged)...

    function renderFileListResults(containerId, data) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        const resultsContent = container.querySelector('.results-content');
        const resultsTitle = container.querySelector('.results-title');
        
        if (resultsTitle) {
            resultsTitle.textContent = data.title || 'File List';
        }

        if (!resultsContent) return;

        if (!data.files || data.files.length === 0) {
            resultsContent.innerHTML = '<div class="empty-state"><div class="icon">📭</div><div class="message">No files found</div></div>';
            return;
        }

        let html = '';
        
        // Add summary if available
        if (data.summary) {
            html += '<div class="analysis-summary">' + escapeHtml(data.summary) + '</div>';
        }

        html += '<div class="file-list">';
        
        data.files.forEach((file, index) => {
            const escapedFilePath = escapeHtml(file.filePath);
            const escapedFileName = escapeHtml(file.fileName);
            const language = file.language || 'unknown';
            const languageIcon = getLanguageIcon(language);
            const lineCount = file.lineCount || 0;
            
            html += '<div class="file-item" data-file-path="' + escapedFilePath + '">' +
                '<div class="file-icon" title="' + language + '">' + languageIcon + '</div>' +
                '<div class="file-content">' +
                '<div class="file-name" title="' + escapedFileName + '">' + escapedFileName + '</div>' +
                '<div class="file-path" title="' + escapedFilePath + '">' + escapedFilePath + '</div>' +
                '<div class="file-meta">' + language + ' • ' + lineCount + ' lines</div>' +
                '</div>' +
                '<div class="file-actions">' +
                '<button class="file-action open-file" data-file-path="' + escapedFilePath + '" title="Open file">📂</button>' +
                '</div>' +
                '</div>';
        });
        
        html += '</div>';
        resultsContent.innerHTML = html;
        
        // Add click handlers for file items and open buttons
        resultsContent.querySelectorAll('.file-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (!e.target.closest('.file-action')) {
                    const filePath = item.getAttribute('data-file-path');
                    vscode.postMessage({ command: 'openFile', path: filePath });
                }
            });
        });
        
        resultsContent.querySelectorAll('.file-action.open-file').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const filePath = btn.getAttribute('data-file-path');
                vscode.postMessage({ command: 'openFile', path: filePath });
            });
        });
    }

    function renderSemanticSearchResults(containerId, data) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        const resultsContent = container.querySelector('.results-content');
        const resultsTitle = container.querySelector('.results-title');
        
        if (resultsTitle) {
            resultsTitle.textContent = data.title || 'Semantic Search Results';
        }

        if (!resultsContent) return;

        const formattedContent = formatSemanticSearchResults(data);
        resultsContent.innerHTML = formattedContent;

        // Add click handlers for open buttons
        resultsContent.querySelectorAll('.open-file-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const filePath = btn.getAttribute('data-file-path');
                vscode.postMessage({ command: 'openFile', path: filePath });
            });
        });

        resultsContent.querySelectorAll('.open-at-line').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const filePath = btn.getAttribute('data-file-path');
                const lineNumber = btn.getAttribute('data-line-number');
                vscode.postMessage({ 
                    command: 'openFileAtLine', 
                    path: filePath, 
                    line: parseInt(lineNumber) 
                });
            });
        });
    }

    function renderCodeUnderstandingResults(containerId, data) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        const resultsContent = container.querySelector('.results-content');
        const resultsTitle = container.querySelector('.results-title');
        
        if (resultsTitle) {
            resultsTitle.textContent = data.title || 'Code Understanding Results';
        }

        if (!resultsContent) return;

        const formattedContent = formatCodeUnderstandingResults(data);
        resultsContent.innerHTML = formattedContent;

        // Add click handlers for open buttons
        resultsContent.querySelectorAll('.open-file-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const filePath = btn.getAttribute('data-file-path');
                vscode.postMessage({ command: 'openFile', path: filePath });
            });
        });

        resultsContent.querySelectorAll('.open-at-line').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const filePath = btn.getAttribute('data-file-path');
                const lineNumber = btn.getAttribute('data-line-number');
                vscode.postMessage({ 
                    command: 'openFileAtLine', 
                    path: filePath, 
                    line: parseInt(lineNumber) 
                });
            });
        });
    }

    function renderResults(containerId, title, content) {
        const container = document.getElementById(containerId);
        if (!container) {
            console.error('Container not found:', containerId);
            return;
        }
        
        const resultsContent = container.querySelector('.results-content');
        if (!resultsContent) {
            console.error('Results content not found in:', containerId);
            return;
        }
        
        const resultsTitle = container.querySelector('.results-title');
        if (resultsTitle) {
            resultsTitle.textContent = title;
        }

        if (typeof content === 'object') {
            if (content.files && Array.isArray(content.files)) {
                renderFileList(resultsContent, content.files, title);
            } else if (content.summary) {
                renderSearchResults(resultsContent, content, title);
            } else if (content.type === 'semanticSearchResults') {
                renderSemanticSearchResultsContent(resultsContent, content, title);
            } else if (content.type === 'codeUnderstandingResults') {
                renderCodeUnderstandingResultsContent(resultsContent, content, title);
            } else {
                renderObjectOutput(resultsContent, content, title);
            }
        } else {
            renderTextOutput(resultsContent, content, title);
        }
    }

    function renderFileList(container, files, title) {
        if (!files || files.length === 0) {
            container.innerHTML = '<div class="empty-state"><div class="icon">📭</div><div class="message">No files found</div></div>';
            return;
        }

        let html = '<div class="file-list">';
        
        files.forEach(file => {
            const escapedFilePath = escapeHtml(file.filePath);
            const escapedFileName = escapeHtml(file.fileName);
            const language = file.language || 'unknown';
            const languageIcon = getLanguageIcon(language);
            
            html += '<div class="file-item" data-file-path="' + escapedFilePath + '">' +
                '<div class="file-icon" title="' + language + '">' + languageIcon + '</div>' +
                '<div class="file-content">' +
                '<div class="file-name" title="' + escapedFileName + '">' + escapedFileName + '</div>' +
                '<div class="file-path" title="' + escapedFilePath + '">' + escapedFilePath + '</div>' +
                '</div>' +
                '<div class="file-actions">' +
                '<button class="file-action" data-file-path="' + escapedFilePath + '" title="Open file">📂</button>' +
                '</div>' +
                '</div>';
        });
        
        html += '</div>';
        container.innerHTML = html;
        
        container.querySelectorAll('.file-action').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const filePath = btn.getAttribute('data-file-path');
                vscode.postMessage({ command: 'openFile', path: filePath });
            });
        });
    }

    function renderSearchResults(container, data, title) {
        let html = '<div class="analysis-summary">' + escapeHtml(data.summary) + '</div>';
        
        if (data.files && Array.isArray(data.files)) {
            html += '<div class="file-list" style="margin-top: 8px;">';
            data.files.forEach(file => {
                const escapedFilePath = escapeHtml(file.filePath);
                const escapedFileName = escapeHtml(file.fileName);
                const language = file.language || 'unknown';
                const languageIcon = getLanguageIcon(language);
                
                html += '<div class="file-item" data-file-path="' + escapedFilePath + '">' +
                    '<div class="file-icon" title="' + language + '">' + languageIcon + '</div>' +
                    '<div class="file-content">' +
                    '<div class="file-name" title="' + escapedFileName + '">' + escapedFileName + '</div>' +
                    '<div class="file-path" title="' + escapedFilePath + '">' + escapedFilePath + '</div>' +
                    '</div>' +
                    '<div class="file-actions">' +
                    '<button class="file-action" data-file-path="' + escapedFilePath + '" title="Open file">📂</button>' +
                    '</div>' +
                    '</div>';
            });
            html += '</div>';
        }
        
        container.innerHTML = html;
    }

    function renderSemanticSearchResultsContent(container, data, title) {
        const formattedContent = formatSemanticSearchResults(data);
        container.innerHTML = formattedContent;

        // Add click handlers for open buttons
        container.querySelectorAll('.open-file-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const filePath = btn.getAttribute('data-file-path');
                vscode.postMessage({ command: 'openFile', path: filePath });
            });
        });

        container.querySelectorAll('.open-at-line').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const filePath = btn.getAttribute('data-file-path');
                const lineNumber = btn.getAttribute('data-line-number');
                vscode.postMessage({ 
                    command: 'openFileAtLine', 
                    path: filePath, 
                    line: parseInt(lineNumber) 
                });
            });
        });
    }

    function renderCodeUnderstandingResultsContent(container, data, title) {
        const formattedContent = formatCodeUnderstandingResults(data);
        container.innerHTML = formattedContent;

        // Add click handlers for open buttons
        container.querySelectorAll('.open-file-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const filePath = btn.getAttribute('data-file-path');
                vscode.postMessage({ command: 'openFile', path: filePath });
            });
        });

        container.querySelectorAll('.open-at-line').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const filePath = btn.getAttribute('data-file-path');
                const lineNumber = btn.getAttribute('data-line-number');
                vscode.postMessage({ 
                    command: 'openFileAtLine', 
                    path: filePath, 
                    line: parseInt(lineNumber) 
                });
            });
        });
    }

    function renderTextOutput(container, text, title) {
        const formattedContent = formatContent(text);
        container.innerHTML = '<div class="analysis-result info">' + formattedContent + '</div>';
    }

    function renderObjectOutput(container, data, title) {
        const jsonString = JSON.stringify(data, null, 2);
        const escapedJson = escapeHtml(jsonString);
        
        container.innerHTML = '<div class="analysis-result info">' +
            '<div class="result-content"><pre class="json-output">' + escapedJson + '</pre></div>' +
            '</div>';
    }

    function updateFileSelector(files) {
        const fileSelector = document.getElementById('file-selector');
        if (!fileSelector) return;
        
        // Clear existing options except the first two
        while (fileSelector.options.length > 2) {
            fileSelector.remove(2);
        }
        
        // Add project files to selector
        files.slice(0, 50).forEach(file => { // Limit to 50 files to avoid performance issues
            const option = document.createElement('option');
            option.value = file.path;
            option.textContent = file.label + ' (' + file.path + ')';
            fileSelector.appendChild(option);
        });
    }

    // Initialize the sidebar
    initialize();
})();