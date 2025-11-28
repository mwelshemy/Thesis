(function() {
    const vscode = (typeof acquireVsCodeApi === 'function') ? acquireVsCodeApi() : {
        getState: () => ({}),
        setState: () => {},
        postMessage: () => {}
    };

    const state = Object.assign({
        chatHistory: [],
        activePanel: 'chat',
        selectedFile: '',
        projectFiles: []
    }, vscode.getState() || {});

    let initialized = false;

    // Track repeated AI/server errors to show a persistent banner
    let consecutiveErrorCount = 0;
    const ERROR_THRESHOLD = 3; // show banner after this many consecutive errors
    let bannerTimeoutId = null;

    // Utility: safe HTML escape
    function escapeHtml(unsafe) {
        if (unsafe === undefined || unsafe === null) return '';
        return String(unsafe)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function stripHtml(html) {
        try {
            const div = document.createElement('div');
            div.innerHTML = html || '';
            return div.innerText || div.textContent || '';
        } catch (e) {
            return String(html || '');
        }
    }

    // Safe wrapper to post message to extension host
    function postToExtension(message) {
        try {
            vscode.postMessage(message);
        } catch (err) {
            console.error('postMessage failed', err, message);
        }
    }

    // -------------------------
    // Persistent banner for AI/server health & error state
    // -------------------------
    function ensureBannerContainer() {
        let banner = document.getElementById('ai-health-banner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'ai-health-banner';
            banner.style.cssText = [
                'position: relative;',
                'display: none;',
                'padding: 10px 12px;',
                'border-radius: 8px;',
                'margin-bottom: 8px;',
                'font-size: 13px;',
                'box-shadow: 0 6px 20px rgba(0,0,0,0.12);',
                'z-index: 9999;'
            ].join('');
            // Insert banner into container top
            const container = document.querySelector('.container') || document.body;
            container.insertBefore(banner, container.firstChild);
        }
        return banner;
    }

    function showHealthBanner(message, type = 'warn', persistent = true) {
        try {
            const banner = ensureBannerContainer();
            banner.innerHTML = ''; // reset

            const icon = document.createElement('span');
            icon.style.marginRight = '10px';
            icon.textContent = type === 'error' ? '⚠️' : (type === 'info' ? 'ℹ️' : '🔔');

            const msgSpan = document.createElement('span');
            msgSpan.style.fontWeight = '600';
            msgSpan.textContent = message;

            const actions = document.createElement('span');
            actions.style.float = 'right';
            actions.style.display = 'flex';
            actions.style.gap = '8px';
            actions.style.alignItems = 'center';

            const retryBtn = document.createElement('button');
            retryBtn.className = 'btn';
            retryBtn.textContent = 'Retry';
            retryBtn.style.fontSize = '12px';
            retryBtn.onclick = () => {
                // Ask extension host to retry a helpful action (best-effort)
                postToExtension({ command: 'getProjectFiles' });
                postToExtension({ command: 'refresh' });
                hideHealthBanner();
            };

            const docsBtn = document.createElement('button');
            docsBtn.className = 'btn';
            docsBtn.textContent = 'Help';
            docsBtn.style.fontSize = '12px';
            docsBtn.onclick = () => {
                // Open a help URL or show inline instructions (best-effort)
                postToExtension({ command: 'executeCommand', cmd: 'vscode.open', args: ['https://example.com/ai-server-troubleshooting'] });
            };

            const closeBtn = document.createElement('button');
            closeBtn.className = 'btn';
            closeBtn.textContent = 'Dismiss';
            closeBtn.style.fontSize = '12px';
            closeBtn.onclick = () => {
                hideHealthBanner();
            };

            actions.appendChild(retryBtn);
            actions.appendChild(docsBtn);
            actions.appendChild(closeBtn);

            banner.appendChild(icon);
            banner.appendChild(msgSpan);
            banner.appendChild(actions);

            banner.style.background = type === 'error' ? 'var(--vscode-inputValidation-errorBackground)' : 'var(--vscode-inputValidation-warningBackground)';
            banner.style.color = 'var(--vscode-input-foreground)';
            banner.style.border = '1px solid ' + (type === 'error' ? 'var(--vscode-inputValidation-errorBorder)' : 'var(--vscode-inputValidation-warningBorder)');

            banner.style.display = 'block';

            if (!persistent) {
                if (bannerTimeoutId) clearTimeout(bannerTimeoutId);
                bannerTimeoutId = setTimeout(() => hideHealthBanner(), 7000);
            }
        } catch (err) {
            console.error('showHealthBanner error', err);
        }
    }

    function hideHealthBanner() {
        try {
            const banner = document.getElementById('ai-health-banner');
            if (banner) banner.style.display = 'none';
            consecutiveErrorCount = 0;
            if (bannerTimeoutId) { clearTimeout(bannerTimeoutId); bannerTimeoutId = null; }
        } catch (err) {
            console.error('hideHealthBanner error', err);
        }
    }

    // Initialization
    function initialize() {
        if (initialized) return;
        initialized = true;
        try {
            setupEventListeners();
            restoreState();
            setSearchPlaceholders();
            postToExtension({ command: 'refresh' });
            postToExtension({ command: 'getProjectFiles' });
        } catch (err) {
            console.error('initialize error', err);
            showNotification('Failed to initialize sidebar UI', 'error', String(err));
        }
    }

    function setSearchPlaceholders() {
        try {
            const placeholder = 'Find code by keywords, function names, or patterns';
            const searchQuery = document.getElementById('search-query');
            const semanticSearchQuery = document.getElementById('semantic-search-query');
            const genericSearch = document.getElementById('search-input');
            if (searchQuery && !searchQuery.getAttribute('placeholder')) searchQuery.setAttribute('placeholder', placeholder);
            if (semanticSearchQuery && !semanticSearchQuery.getAttribute('placeholder')) semanticSearchQuery.setAttribute('placeholder', placeholder);
            if (genericSearch && !genericSearch.getAttribute('placeholder')) genericSearch.setAttribute('placeholder', placeholder);
        } catch (e) {
            // silently ignore if elements are not present
        }
    }

    function restoreState() {
        try {
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
        } catch (err) {
            console.error('restoreState error', err);
        }
    }

    // -------------------------
    // UI formatting functions
    // -------------------------
    function formatFunctionSearchResults(data) {
        let html = '';

        if (data && data.summary) {
            html += '<div class="analysis-summary">' + escapeHtml(data.summary) + '</div>';
        }

        if (data && data.query) {
            html += '<div class="analysis-summary" style="background: var(--vscode-textBlockQuote-background); margin-bottom: 16px;">' +
                '<strong>Your Query:</strong> ' + escapeHtml(data.query) +
                '</div>';
        }

        if (data && Array.isArray(data.results) && data.results.length > 0) {
            html += '<div class="function-results">';
            data.results.forEach((result) => {
                const escapedFilePath = escapeHtml(result.filePath || '');
                const escapedFileName = escapeHtml(result.fileName || escapedFilePath.split(/[\\/]/).pop() || '');
                const language = result.language || 'unknown';
                const languageIcon = getLanguageIcon(language);
                const score = result.relevanceScore ?? result.confidence;
                const confidence = (typeof score === 'number') ? (Math.round(score * 100) + '% match') : (score || 'High relevance');
                const functionType = result.functionType || 'function';
                const lineNumber = result.lineNumber || 1;

                html += '<div class="function-result-item">' +
                    '<div class="function-result-header">' +
                    '<div class="file-info">' +
                    '<div class="file-icon" title="' + escapeHtml(language) + '">' + languageIcon + '</div>' +
                    '<div class="file-details">' +
                    '<div class="file-name" title="' + escapedFileName + '">' + escapedFileName + '</div>' +
                    '<div class="file-path" title="' + escapedFilePath + '">' + escapedFilePath + '</div>' +
                    '</div>' +
                    '</div>' +
                    '<div class="confidence-badge">' + escapeHtml(confidence) + '</div>' +
                    '</div>' +
                    '<div class="function-details">' +
                    '<div class="function-name"><strong>' + escapeHtml(functionType) + ':</strong> <code>' + escapeHtml(result.functionName || '') + '</code></div>' +
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
                    'data-line-number="' + escapeHtml(lineNumber) + '">' +
                    '📝 Open Function at Line ' + escapeHtml(lineNumber) +
                    '</button>' +
                    '<button class="btn open-file-btn" data-file-path="' + escapedFilePath + '">📂 Open File</button>' +
                    '</div>' +
                    '</div>';
            });
            html += '</div>';
        } else {
            html += '<div class="empty-state"><div class="icon">🔍</div><div class="message">No functions found matching your description. Try different words.</div></div>';
        }

        return html;
    }

    // -------------------------
    // Message handling
    // -------------------------
    function handleExtensionMessage(msg) {
        try {
            if (!msg) return;

            // Hide spinners and enable buttons after any incoming message
            try {
                document.querySelectorAll('.spinner').forEach(s => s.classList.add('hidden'));
                document.querySelectorAll('.btn').forEach(b => b.disabled = false);
            } catch (e) { /* ignore UI errors */ }

            // Quick heuristic for error-like messages to surface as toast and possibly show banner
            try {
                const title = (typeof msg.title === 'string' ? msg.title : '');
                const content = (typeof msg.content === 'string' ? msg.content : '');
                const lowerTitle = title.toLowerCase();
                const lowerContent = content.toLowerCase();

                const isErrorLike = (
                    title && (
                        lowerTitle.includes('error') ||
                        lowerTitle.includes('hang up') ||
                        lowerTitle.includes('unreachable') ||
                        lowerTitle.includes('not found')
                    ) ||
                    content && (
                        lowerContent.includes('ai server') ||
                        lowerContent.includes('connection lost') ||
                        lowerContent.includes('socket hang up') ||
                        lowerContent.includes('econ') ||
                        lowerContent.includes('ecoled') ||
                        lowerContent.includes('refused') ||
                        lowerContent.includes('failed to connect')
                    )
                );

                if (isErrorLike) {
                    showNotification(stripHtml(msg.title || 'Error'), 'error', msg.content || '');
                    consecutiveErrorCount++;
                    // If errors persist, surface persistent banner with actionable guidance
                    if (consecutiveErrorCount >= ERROR_THRESHOLD) {
                        showHealthBanner('AI server appears unreachable. Check that your local AI server (http://localhost:8000) is running and reachable, or rebuild the RAG index.', 'error', true);
                    } else {
                        // show a temporary banner for single/occasional errors
                        showHealthBanner('Temporary connection error to AI server detected.', 'warn', false);
                    }
                } else {
                    // reset on any healthy message
                    consecutiveErrorCount = 0;
                    hideHealthBanner();
                }
            } catch (e) { /* continue */ }

            // Core types
            if (msg.type === 'clearChat') {
                state.chatHistory = [];
                persistState();
                renderChatHistory();
                return;
            }

            if (msg.type === 'aiOutput') {
                const title = msg.title || '';
                const content = msg.content;
                const action = msg.action || '';

                state.lastResults = state.lastResults || {};
                state.lastResults[title] = content;
                persistState();

                if (content && content.type === 'functionSearchResults') {
                    renderFunctionSearchResultsContainer(content);
                    setActivePanel('search');
                    return;
                }

                routeToCorrectPanel(msg, title, content, action);
                return;
            }

            if (msg.type === 'previewData') {
                const combined = 'Original:\n\n' + (msg.original || '') + '\n\n== Refactored ==\n\n' + (msg.modified || '');
                renderResults('analyze-results', 'Code Preview', combined);
                setActivePanel('analyze');
                return;
            }

            if (msg.type === 'projectFiles') {
                state.projectFiles = Array.isArray(msg.files) ? msg.files : [];
                persistState();
                updateFileSelector(state.projectFiles);
                return;
            }

            // Support explicit AI status messages from extension host (recommended)
            if (msg.type === 'aiStatus') {
                // { type: 'aiStatus', status: 'ok' | 'unreachable' | 'degraded', message?: string }
                if (msg.status === 'ok') {
                    consecutiveErrorCount = 0;
                    hideHealthBanner();
                    if (msg.message) showNotification(msg.message, 'info');
                } else {
                    consecutiveErrorCount++;
                    showHealthBanner(msg.message || 'AI server status: ' + msg.status, msg.status === 'unreachable' ? 'error' : 'warn', true);
                }
                return;
            }

            // Unknown message types: log
            console.debug('Unhandled message from extension:', msg);
        } catch (err) {
            console.error('handleExtensionMessage error', err);
            showNotification('Sidebar message handling error', 'error', escapeHtml(String(err)));
        }
    }

    // Convenience wrapper to render function search results into search-results container
    function renderFunctionSearchResultsContainer(data) {
        try {
            const container = document.getElementById('text-search-results') || document.getElementById('search-results');
            if (!container) return;
            const resultsContent = container.querySelector('.results-content');
            const resultsTitle = container.querySelector('.results-title');
            if (resultsTitle) resultsTitle.textContent = data.title || 'Function Search Results';
            if (!resultsContent) return;
            resultsContent.innerHTML = formatFunctionSearchResults(data);
            attachResultButtons(resultsContent);
            if (container) container.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (err) {
            console.error('renderFunctionSearchResultsContainer', err);
        }
    }

    // -------------------------
    // Event setup & delegation
    // -------------------------
    function setupEventListeners() {
        // Prevent double-binding
        if (setupEventListeners._done) return;
        setupEventListeners._done = true;

        // Tab switching
        document.querySelectorAll('.tab').forEach(tab => {
            safeAddListener(tab, 'click', (e) => {
                e.preventDefault();
                const panelId = tab.getAttribute('data-panel');
                if (panelId) setActivePanel(panelId);
            });
        });

        // File selector change
        const fileSelector = document.getElementById('file-selector');
        if (fileSelector) {
            safeAddListener(fileSelector, 'change', (e) => {
                try {
                    state.selectedFile = e.target.value;
                    persistState();
                } catch (err) { /* ignore */ }
            });
        }

        // Chat controls
        const sendButton = document.getElementById('send-message');
        const chatInput = document.getElementById('chat-input');
        const clearButton = document.getElementById('clear-chat');

        if (sendButton) safeAddListener(sendButton, 'click', () => sendMessage('chat'));
        if (chatInput) safeAddListener(chatInput, 'keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                sendMessage('chat');
                e.preventDefault();
            }
        });
        if (clearButton) safeAddListener(clearButton, 'click', () => postToExtension({ command: 'clearChat' }));

        // Analysis cards
        document.querySelectorAll('.analysis-card').forEach(card => {
            safeAddListener(card, 'click', () => {
                const action = card.getAttribute('data-action');
                const scope = card.getAttribute('data-scope');
                if (action === 'analyzeProject') analyzeProject(scope);
            });
        });

        setupButtonListeners();

        // Listen for messages from extension host
        safeAddListener(window, 'message', (event) => {
            try {
                handleExtensionMessage(event.data);
            } catch (err) {
                console.error('message event handler error', err);
            }
        });

        // Persist state on unload
        safeAddListener(window, 'beforeunload', () => {
            try { persistState(); } catch (e) { /* ignore */ }
        });
    }

    function safeAddListener(target, evt, fn) {
        try {
            if (target && typeof target.addEventListener === 'function') {
                target.addEventListener(evt, fn);
            }
        } catch (e) {
            console.error('safeAddListener failed', e);
        }
    }

    // Attach open file / open at line handlers for a container
    function attachResultButtons(container) {
        try {
            if (!container) return;
            container.querySelectorAll('.open-file-btn').forEach(btn => {
                safeAddListener(btn, 'click', (e) => {
                    e.preventDefault();
                    const filePath = btn.getAttribute('data-file-path');
                    postToExtension({ command: 'openFile', path: filePath });
                });
            });

            container.querySelectorAll('.open-at-line, .code-snippet-link').forEach(btn => {
                safeAddListener(btn, 'click', (e) => {
                    e.preventDefault();
                    const filePath = btn.getAttribute('data-file-path');
                    const lineNumber = parseInt(btn.getAttribute('data-line-number') || '1', 10);
                    postToExtension({ command: 'openFileAtLine', path: filePath, line: lineNumber });
                });
            });
        } catch (err) {
            console.error('attachResultButtons error', err);
        }
    }

    // -------------------------
    // Helpers: selected file, buttons
    // -------------------------
    function getSelectedFilePath() {
        const fileSelector = document.getElementById('file-selector');
        if (!fileSelector) return undefined;
        const selectedValue = fileSelector.value;
        if (selectedValue === 'project') return 'project';
        if (!selectedValue) return undefined;
        return selectedValue;
    }

    function setupButtonListeners() {
        // Avoid running twice
        if (setupButtonListeners._done) return;
        setupButtonListeners._done = true;

        const analyzeRun = document.getElementById('analyze-run');
        const searchRun = document.getElementById('search-run');
        const buildIndex = document.getElementById('build-index');
        const langRun = document.getElementById('lang-run');
        const semanticSearchRun = document.getElementById('semantic-search-run');

        if (analyzeRun) safeAddListener(analyzeRun, 'click', () => {
            const code = (document.getElementById('analyze-code')?.value || '').trim();
            if (!code) { showNotification('Please enter code to analyze', 'warning'); return; }
            const filePath = getSelectedFilePath();
            sendMessage('deepAnalysis', { code, path: filePath });
        });

        if (searchRun) safeAddListener(searchRun, 'click', () => {
            const query = (document.getElementById('search-query')?.value || '').trim();
            if (!query) { showNotification('Find code by keywords, function names, or patterns', 'warning'); return; }

            // Visual feedback: clear and show loading in text-search-results
            const container = document.getElementById('text-search-results') || document.getElementById('search-results');
            if (container) {
                const rc = container.querySelector('.results-content');
                if (rc) rc.innerHTML = '<div class="empty-state"><div class="icon">🔎</div><div class="message">Searching...</div></div>';
                container.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }

            sendMessage('searchProject', { query });
        });

        if (buildIndex) safeAddListener(buildIndex, 'click', () => {
            postToExtension({ command: 'run', action: 'buildSearchIndex' });
        });

        if (langRun) safeAddListener(langRun, 'click', () => {
            const language = document.getElementById('lang-select')?.value || '';
            if (!language) { showNotification('Please select a language', 'warning'); return; }

            // Visual feedback: clear and show loading in lang-search-results
            const container = document.getElementById('lang-search-results');
            if (container) {
                const rc = container.querySelector('.results-content');
                if (rc) rc.innerHTML = '<div class="empty-state"><div class="icon">🌐</div><div class="message">Browsing files...</div></div>';
                container.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }

            sendMessage('searchByLanguage', { language });
        });

        if (semanticSearchRun) safeAddListener(semanticSearchRun, 'click', () => {
            const query = (document.getElementById('semantic-search-query')?.value || '').trim();
            if (!query) { showNotification('Find code by keywords, function names, or patterns', 'warning'); return; }

            // Visual feedback: reuse text-search-results
            const container = document.getElementById('text-search-results') || document.getElementById('search-results');
            if (container) {
                const rc = container.querySelector('.results-content');
                if (rc) rc.innerHTML = '<div class="empty-state"><div class="icon">🎯</div><div class="message">Finding matching code...</div></div>';
                container.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }

            sendMessage('semanticSearch', { query });
        });

        // Delegated copy and code-snippet link handling
        safeAddListener(document, 'click', (e) => {
            const target = e.target;
            if (!target) return;

            // Copy button
            if (target.classList && target.classList.contains('copy-btn')) {
                try {
                    const container = target.closest('.results-container');
                    if (container) {
                        const content = container.querySelector('.results-content');
                        if (content) {
                            const text = (content.innerText || content.textContent || '').trim();
                            if (navigator.clipboard && navigator.clipboard.writeText) {
                                navigator.clipboard.writeText(text).then(() => {
                                    const original = target.innerHTML;
                                    target.innerHTML = '✓';
                                    setTimeout(() => { target.innerHTML = original; }, 2000);
                                }).catch(err => {
                                    showNotification('Copy failed: ' + String(err), 'error');
                                });
                            } else {
                                // fallback
                                const ta = document.createElement('textarea');
                                ta.value = text;
                                document.body.appendChild(ta);
                                ta.select();
                                try { document.execCommand('copy'); showNotification('Copied', 'info'); } catch (err) { showNotification('Copy failed', 'error'); }
                                document.body.removeChild(ta);
                            }
                        }
                    }
                } catch (err) {
                    console.error('copy-btn handler error', err);
                }
            }

            // code-snippet link handled elsewhere via attachResultButtons but keep this as safety
            if (target.classList && target.classList.contains('code-snippet-link')) {
                e.preventDefault();
                const filePath = target.getAttribute('data-file-path');
                const lineNumber = parseInt(target.getAttribute('data-line-number') || '1', 10);
                postToExtension({ command: 'openFileAtLine', path: filePath, line: lineNumber });
            }
        });
    }

    // -------------------------
    // Notifications & rendering
    // -------------------------
    function showNotification(message, type = 'info', submessage) {
        try {
            document.querySelectorAll('.vsc-toast').forEach(x => x.remove());

            const notification = document.createElement('div');
            notification.className = 'vsc-toast';
            notification.style.cssText = [
                'position: fixed;',
                'top: 20px;',
                'right: 20px;',
                'padding: 12px 18px;',
                'background:' + (
                    type === 'warning'
                        ? 'var(--vscode-inputValidation-warningBackground)'
                        : type === 'error'
                            ? 'var(--vscode-inputValidation-errorBackground)'
                            : 'var(--vscode-inputValidation-infoBackground)'
                ) + ';',
                'border: 2px solid ' + (
                    type === 'warning'
                        ? 'var(--vscode-inputValidation-warningBorder)'
                        : type === 'error'
                            ? 'var(--vscode-inputValidation-errorBorder)'
                            : 'var(--vscode-inputValidation-infoBorder)'
                ) + ';',
                'box-shadow: 0 6px 24px rgba(0,0,0,0.11);',
                'border-radius: 7px;',
                'color: var(--vscode-input-foreground);',
                'font-size: 13px;',
                'z-index: 10000;',
                'min-width: 170px;',
                'max-width: 350px;',
                'word-break: break-word;',
            ].join('');
            notification.innerHTML =
                '<b style="font-size:15px;">' + escapeHtml(message) + '</b>' +
                (submessage ? ('<div style="margin-top:5px; font-size:12px; max-width:320px;">' + escapeHtml(String(submessage)) + '</div>') : '');

            document.body.appendChild(notification);

            setTimeout(() => {
                if (notification.parentNode) notification.parentNode.removeChild(notification);
            }, 6400);
        } catch (err) {
            console.error('showNotification error', err);
        }
    }

    function setActivePanel(panelId) {
        try {
            document.querySelectorAll('.panel').forEach(panel => panel.classList.remove('active'));
            document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));

            const activePanel = document.getElementById(panelId);
            const activeTab = document.querySelector('[data-panel="' + panelId + '"]');

            if (activePanel) activePanel.classList.add('active');
            if (activeTab) activeTab.classList.add('active');

            state.activePanel = panelId;
            persistState();
        } catch (err) {
            console.error('setActivePanel error', err);
        }
    }

    function renderChatHistory() {
        try {
            const chatMessages = document.getElementById('chat-messages');
            if (!chatMessages) return;
            chatMessages.innerHTML = '';
            (state.chatHistory || []).forEach(msg => {
                addMessage(msg.role, msg.content, false);
            });
        } catch (err) {
            console.error('renderChatHistory error', err);
        }
    }

    function addMessage(role, content, saveToHistory = true) {
        try {
            const chatMessages = document.getElementById('chat-messages');
            if (!chatMessages) return;

            const messageDiv = document.createElement('div');
            messageDiv.className = 'message ' + role;

            const formattedContent = formatContent(content);

            const messageHeader = document.createElement('div');
            messageHeader.className = 'message-header';
            if (role === 'user') messageHeader.innerHTML = '<span class="message-icon">👤</span><span>You</span>';
            else if (role === 'assistant') messageHeader.innerHTML = '<span class="message-icon">🤖</span><span>AI Assistant</span>';
            else messageHeader.innerHTML = '<span class="message-icon">🤖</span><span>VS AI Assistant</span>';

            const messageContent = document.createElement('div');
            messageContent.className = 'message-content';
            messageContent.innerHTML = formattedContent;

            messageDiv.appendChild(messageHeader);
            messageDiv.appendChild(messageContent);
            chatMessages.appendChild(messageDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;

            if (saveToHistory && role !== 'system') {
                state.chatHistory = state.chatHistory || [];
                state.chatHistory.push({ role, content });
                persistState();
            }
        } catch (err) {
            console.error('addMessage error', err);
        }
    }

    function formatContent(content) {
        try {
            if (typeof content !== 'string') return formatObjectContent(content);

            let formatted = escapeHtml(content);

            // code blocks
            formatted = formatted.replace(/```(\w+)?\n([\s\S]*?)```/g, function(match, lang, code) {
                const language = lang || 'text';
                return '<div class="code-block-container"><div class="code-header">' +
                    escapeHtml(language) +
                    '</div><pre class="code-block"><code>' +
                    escapeHtml(code.trim()) +
                    '</code></pre></div>';
            });

            // inline code
            formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');

            // headers
            formatted = formatted.replace(/^### (.*$)/gim, '<h3>$1</h3>');
            formatted = formatted.replace(/^## (.*$)/gim, '<h2>$1</h2>');
            formatted = formatted.replace(/^# (.*$)/gim, '<h1>$1</h1>');

            // bold/italic
            formatted = formatted.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
            formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');

            // lists
            formatted = formatted.replace(/^- (.*$)/gim, '<li>$1</li>');
            formatted = formatted.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

            // breaks and paragraphs
            formatted = formatted.replace(/\n\n/g, '</p><p>');
            formatted = formatted.replace(/\n/g, '<br>');

            if (!formatted.includes('<div') && !formatted.includes('<pre') && !formatted.includes('<h') && !formatted.includes('<ul') && !formatted.includes('<ol')) {
                formatted = '<p>' + formatted + '</p>';
            }

            return formatted;
        } catch (err) {
            console.error('formatContent error', err);
            return escapeHtml(String(content || ''));
        }
    }

    function formatObjectContent(obj) {
        try {
            if (obj && typeof obj === 'object') {
                if (Array.isArray(obj.files) || (obj.type === 'fileList' && Array.isArray(obj.files))) return formatFileList(obj);
                if (obj.type === 'semanticSearchResults' || obj.type === 'semanticResults') return formatSemanticSearchResults(obj);
                if (obj.type === 'codeUnderstandingResults') return formatCodeUnderstandingResults(obj);
                if (obj.type === 'functionSearchResults') return formatFunctionSearchResults(obj);
                return '<pre class="json-output">' + escapeHtml(JSON.stringify(obj, null, 2)) + '</pre>';
            }
            return escapeHtml(String(obj));
        } catch (err) {
            console.error('formatObjectContent error', err);
            return escapeHtml(String(obj));
        }
    }

    // formatFileList, formatSemanticSearchResults, formatCodeUnderstandingResults are expected to exist elsewhere in this file.
    // For safety, provide minimal fallbacks if not defined.
    function formatFileList(data) {
        try {
            let html = '';
            if (data.summary) html += '<div class="analysis-summary">' + escapeHtml(data.summary) + '</div>';
            if (Array.isArray(data.files) && data.files.length > 0) {
                html += '<div class="file-list">';
                data.files.forEach(file => {
                    const escapedFilePath = escapeHtml(file.filePath || '');
                    const escapedFileName = escapeHtml(file.fileName || escapedFilePath.split(/[\\/]/).pop() || '');
                    const language = file.language || 'unknown';
                    const languageIcon = getLanguageIcon(language);
                    const lineCount = file.lineCount || 0;
                    html += '<div class="file-item" data-file-path="' + escapedFilePath + '">' +
                        '<div class="file-icon" title="' + escapeHtml(language) + '">' + languageIcon + '</div>' +
                        '<div class="file-content">' +
                        '<div class="file-name" title="' + escapedFileName + '">' + escapedFileName + '</div>' +
                        '<div class="file-path" title="' + escapedFilePath + '">' + escapedFilePath + '</div>' +
                        '<div class="file-meta">' + escapeHtml(language) + ' • ' + escapeHtml(lineCount) + ' lines</div>' +
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
        } catch (err) {
            console.error('formatFileList error', err);
            return '<pre>' + escapeHtml(JSON.stringify(data || {}, null, 2)) + '</pre>';
        }
    }

    // Minimal implementations if not present earlier (safe and consistent)
    // Keep formatSemanticSearchResults for quick JSON rendering in chat, but actual rendering for semantic results is handled by renderSemanticSearchResults
    function formatSemanticSearchResults(data) {
        // If data has 'snippets' or 'results' convert to fileList-like shape for basic fallback
        try {
            const items = data.snippets || data.results || data.results || [];
            if (!Array.isArray(items) || items.length === 0) {
                return '<div class="empty-state"><div class="icon">🔍</div><div class="message">No semantic matches found</div></div>';
            }
            const fileList = {
                summary: data.summary || (data.title ? data.title : ''),
                files: items.map(it => ({
                    fileName: it.fileName || it.file || it.filename || '',
                    filePath: it.filePath || it.filepath || it.filepath || '',
                    language: it.language || it.lang || it.language || '',
                    lineCount: it.lineNumber || 0
                }))
            };
            return formatFileList(fileList);
        } catch (err) {
            console.error('formatSemanticSearchResults fallback error', err);
            return '<pre>' + escapeHtml(JSON.stringify(data || {}, null, 2)) + '</pre>';
        }
    }
    function formatCodeUnderstandingResults(data) {
        return formatFileList(data);
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

    // -------------------------
    // Sending messages to extension
    // -------------------------
    function sendMessage(action, payload = {}) {
        try {
            const messageText = (document.getElementById('chat-input')?.value || '').trim();

            if (action === 'chat' && !messageText) {
                showNotification('Please enter a message', 'warning');
                return;
            }

            if (action === 'chat') {
                addMessage('user', messageText);
                const chatInput = document.getElementById('chat-input');
                if (chatInput) chatInput.value = '';
            }

            // Show spinner (best-effort)
            try {
                const spinner = document.getElementById(action + '-spinner') ||
                    document.getElementById('chat-spinner') ||
                    document.getElementById('analyze-spinner') ||
                    document.getElementById('search-spinner');
                if (spinner) spinner.classList.remove('hidden');
            } catch (e) { /* ignore */ }

            // Disable sending button (best-effort)
            try {
                const button = document.getElementById(action + '-run') || document.getElementById('send-message');
                if (button) button.disabled = true;
            } catch (e) { /* ignore */ }

            postToExtension({
                command: 'run',
                action: action,
                payload: action === 'chat' ? { message: messageText } : payload
            });
        } catch (err) {
            console.error('sendMessage error', err);
            showNotification('Failed to send message', 'error', String(err));
        }
    }

    function analyzeProject(scope = 'full') {
        try {
            const spinner = document.getElementById('analyze-spinner');
            if (spinner) spinner.classList.remove('hidden');
            postToExtension({ command: 'analyzeProject', scope });
        } catch (err) {
            console.error('analyzeProject error', err);
        }
    }

    // -------------------------
    // Routing & rendering results
    // -------------------------
    function routeToCorrectPanel(msg, title, content, action) {
        try {
            if (action === 'chat' || (msg && msg.action === 'chat')) {
                addMessage('assistant', (typeof content === 'string' ? content : JSON.stringify(content)));
                setActivePanel('chat');
                return;
            }

            if (msg.contentType === 'object') {
                handleStructuredContent(content, title, action);
            } else {
                handleTextContent(content, title, action);
            }
        } catch (err) {
            console.error('routeToCorrectPanel error', err);
        }
    }

    function handleStructuredContent(content, title, action) {
        try {
            if (!content) {
                renderResults('analyze-results', title, 'No content returned');
                setActivePanel('analyze');
                return;
            }

            // Determine the target container ID so results render inside the same section the user used
            let targetContainer = 'search-results'; // default (global)
            if (action === 'searchProject' || action === 'codeUnderstandingSearch' || action === 'semanticSearch' || action === 'semanticFunctionSearch') {
                targetContainer = 'text-search-results';
            } else if (action === 'searchByLanguage') {
                targetContainer = 'lang-search-results';
            } else if (action === 'analyzeProject' || action === 'findBugsInProject') {
                targetContainer = 'analyze-results';
            }

            // Normalize and render based on content.type (support multiple type names from backend)
            const t = (content && content.type) ? String(content.type).toLowerCase() : '';

            if (t === 'filelist' || (content.files && Array.isArray(content.files))) {
                renderFileListResults(targetContainer, content);
                setActivePanel('search');
                return;
            }

            if (t === 'semanticsearchresults' || t === 'semanticresults' || content.snippets || content.results) {
                // Normalize different shapes into a consistent "semanticSearchResults" object
                const items = content.snippets || content.results || content.results || [];
                const normalized = {
                    type: 'semanticSearchResults',
                    title: content.title || content.summary || 'Semantic Search Results',
                    summary: content.summary || `Found ${items.length} matches`,
                    query: content.query || '',
                    results: items.map(it => ({
                        fileName: it.fileName || it.filename || it.file || '',
                        filePath: it.filePath || it.filepath || it.file || '',
                        language: it.language || it.lang || 'unknown',
                        lineNumber: it.lineNumber || it.line || 1,
                        confidence: it.confidence || it.confidence || (it.relevance ? `${Math.round((it.relevance||0)*100)}%` : ''),
                        similarity: (it.relevance !== undefined && typeof it.relevance === 'number') ? it.relevance.toFixed(3) : (it.similarity || ''),
                        codeSnippet: it.content || it.code || it.preview || '',
                        preview: (it.preview) ? it.preview : ((it.content && it.content.substring) ? it.content.substring(0, 150) + '...' : '')
                    }))
                };
                renderSemanticSearchResults(targetContainer, normalized);
                setActivePanel('search');
                return;
            }

            if (t === 'codeunderstandingresults') {
                renderCodeUnderstandingResults(targetContainer, content);
                setActivePanel('search');
                return;
            }

            if (t === 'functionsearchresults') {
                // function search results render with a specialized formatter
                const container = document.getElementById(targetContainer) || document.getElementById('search-results');
                if (container) {
                    const resultsContent = container.querySelector('.results-content');
                    const resultsTitle = container.querySelector('.results-title');
                    if (resultsTitle) resultsTitle.textContent = content.title || 'Function Search Results';
                    if (resultsContent) {
                        resultsContent.innerHTML = formatFunctionSearchResults(content);
                        attachResultButtons(resultsContent);
                    }
                    container.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                setActivePanel('search');
                return;
            }

            // Fallback: show structured content in analyze panel
            renderResults('analyze-results', title || 'Result', JSON.stringify(content, null, 2));
            setActivePanel('analyze');
        } catch (err) {
            console.error('handleStructuredContent error', err);
        }
    }

    function handleTextContent(content, title, action) {
        try {
            const actionType = action || '';
            switch (actionType) {
                case 'explainCode':
                case 'findBugs':
                case 'suggestImprovements':
                case 'deepAnalysis':
                case 'analyzeProject':
                case 'findBugsInProject':
                case 'generateProjectSummary':
                case 'summarizeFile':
                    renderResults('analyze-results', title || 'Analysis', content);
                    setActivePanel('analyze');
                    break;

                case 'searchProject':
                case 'searchByLanguage':
                case 'buildSearchIndex':
                case 'codeUnderstandingSearch':
                case 'semanticSearch':
                    // Render textual search outputs into the text-search-results or lang-search-results section if present
                    let target = 'search-results';
                    if (actionType === 'searchByLanguage') target = 'lang-search-results';
                    else target = 'text-search-results';
                    renderResults(target, title || 'Search Results', content);
                    setActivePanel('search');
                    break;

                default:
                    const lowerTitle = (title || '').toLowerCase();
                    const lowerContent = (typeof content === 'string' ? content.toLowerCase() : '');

                    if (lowerTitle.includes('search') || lowerTitle.includes('result') ||
                        lowerContent.includes('search') || lowerContent.includes('found') ||
                        lowerContent.includes('matches')) {
                        renderResults('search-results', title || 'Search Results', content);
                        setActivePanel('search');
                    } else if (lowerTitle.includes('analysis') || lowerTitle.includes('bug') ||
                        lowerTitle.includes('explain') || lowerTitle.includes('summary') ||
                        lowerTitle.includes('improvement') || lowerTitle.includes('project') ||
                        lowerContent.includes('analysis') || lowerContent.includes('bug') ||
                        lowerContent.includes('suggest')) {
                        renderResults('analyze-results', title || 'Analysis', content);
                        setActivePanel('analyze');
                    } else {
                        renderResults('analyze-results', title || 'Result', content);
                        setActivePanel('analyze');
                    }
            }
        } catch (err) {
            console.error('handleTextContent error', err);
        }
    }

    // -------------------------
    // Rendering helper functions (file lists, semantic results, etc.)
    // -------------------------
    function renderFileListResults(containerId, data) {
        try {
            const container = document.getElementById(containerId) || document.getElementById('search-results');
            if (!container) return;
            const resultsContent = container.querySelector('.results-content');
            const resultsTitle = container.querySelector('.results-title');
            if (resultsTitle) resultsTitle.textContent = data.title || 'File List';
            if (!resultsContent) return;

            if (!data.files || data.files.length === 0) {
                resultsContent.innerHTML = '<div class="empty-state"><div class="icon">📭</div><div class="message">No files found</div></div>';
                return;
            }

            let html = '';
            if (data.summary) html += '<div class="analysis-summary">' + escapeHtml(data.summary) + '</div>';
            html += '<div class="file-list">';
            data.files.forEach(file => {
                const escapedFilePath = escapeHtml(file.filePath || '');
                const escapedFileName = escapeHtml(file.fileName || escapedFilePath.split(/[\\/]/).pop() || '');
                const language = file.language || 'unknown';
                const languageIcon = getLanguageIcon(language);
                const lineCount = file.lineCount || 0;
                html += '<div class="file-item" data-file-path="' + escapedFilePath + '">' +
                    '<div class="file-icon" title="' + escapeHtml(language) + '">' + languageIcon + '</div>' +
                    '<div class="file-content">' +
                    '<div class="file-name" title="' + escapedFileName + '">' + escapedFileName + '</div>' +
                    '<div class="file-path" title="' + escapedFilePath + '">' + escapedFilePath + '</div>' +
                    '<div class="file-meta">' + escapeHtml(language) + ' • ' + escapeHtml(lineCount) + ' lines</div>' +
                    '</div>' +
                    '<div class="file-actions">' +
                    '<button class="file-action open-file" data-file-path="' + escapedFilePath + '" title="Open file">📂</button>' +
                    '</div>' +
                    '</div>';
            });
            html += '</div>';
            resultsContent.innerHTML = html;

            // attach handlers
            attachResultButtons(resultsContent);
            resultsContent.querySelectorAll('.file-item').forEach(item => {
                safeAddListener(item, 'click', (e) => {
                    if (!e.target.closest('.file-action')) {
                        const filePath = item.getAttribute('data-file-path');
                        postToExtension({ command: 'openFile', path: filePath });
                    }
                });
            });

            // ensure visibility
            container.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (err) {
            console.error('renderFileListResults error', err);
        }
    }

    function renderSemanticSearchResults(containerId, data) {
        try {
            const container = document.getElementById(containerId) || document.getElementById('search-results');
            if (!container) return;
            const resultsContent = container.querySelector('.results-content');
            const resultsTitle = container.querySelector('.results-title');
            if (resultsTitle) resultsTitle.textContent = data.title || 'Semantic Search Results';
            if (!resultsContent) return;

            // Build rich semantic results UI similar to function results and language file list
            let html = '';
            if (data.summary) html += '<div class="analysis-summary">' + escapeHtml(data.summary) + '</div>';

            const items = Array.isArray(data.results) ? data.results : [];
            if (items.length === 0) {
                html += '<div class="empty-state"><div class="icon">🔍</div><div class="message">No matching code found.</div></div>';
                resultsContent.innerHTML = html;
                return;
            }

            html += '<div class="semantic-results">';
            items.forEach((it, idx) => {
                const fileName = escapeHtml(it.fileName || '');
                const filePath = escapeHtml(it.filePath || '');
                const language = escapeHtml(it.language || 'unknown');
                const langIcon = getLanguageIcon(language);
                const preview = escapeHtml(it.preview || (it.codeSnippet ? it.codeSnippet.substring(0,150) + '...' : ''));
                const confidence = escapeHtml(it.confidence || (it.similarity ? `${Math.round((parseFloat(it.similarity)||0)*100)}%` : ''));
                const lineNumber = it.lineNumber || 1;

                html += '<div class="semantic-result-item">' +
                    '<div class="semantic-result-header">' +
                      '<div class="file-info">' +
                        '<div class="file-icon" title="' + language + '">' + langIcon + '</div>' +
                        '<div class="file-details">' +
                          '<div class="file-name" title="' + fileName + '">' + fileName + '</div>' +
                          '<div class="file-path" title="' + filePath + '">' + filePath + '</div>' +
                        '</div>' +
                      '</div>' +
                      '<div class="confidence-badge">' + (confidence || '—') + '</div>' +
                    '</div>';

                if (it.explanation) {
                    html += '<div class="function-info"><strong>Why it matches:</strong> ' + escapeHtml(it.explanation) + '</div>';
                }

                if (preview) {
                    html += '<div class="code-snippet-preview">' +
                        '<div class="snippet-header">Preview</div>' +
                        '<pre class="code-snippet"><code>' + preview + '</code></pre>' +
                        '</div>';
                }

                html += '<div class="action-buttons">' +
                        '<button class="open-at-line btn primary code-snippet-link" data-file-path="' + filePath + '" data-line-number="' + escapeHtml(lineNumber) + '">📝 Open at line ' + escapeHtml(lineNumber) + '</button>' +
                        '<button class="open-file-btn btn" data-file-path="' + filePath + '">📂 Open File</button>' +
                    '</div>' +
                  '</div>';
            });
            html += '</div>';

            resultsContent.innerHTML = html;
            attachResultButtons(resultsContent);
            container.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (err) {
            console.error('renderSemanticSearchResults error', err);
            // fallback to generic rendering
            try {
                const container = document.getElementById(containerId) || document.getElementById('search-results');
                if (container) {
                    const resultsContent = container.querySelector('.results-content');
                    resultsContent.innerHTML = formatSemanticSearchResults(data);
                }
            } catch (e) { /* ignore */ }
        }
    }

    function renderCodeUnderstandingResults(containerId, data) {
        try {
            const container = document.getElementById(containerId) || document.getElementById('search-results');
            if (!container) return;
            const resultsContent = container.querySelector('.results-content');
            const resultsTitle = container.querySelector('.results-title');
            if (resultsTitle) resultsTitle.textContent = data.title || 'Code Understanding Results';
            if (!resultsContent) return;
            resultsContent.innerHTML = formatCodeUnderstandingResults(data);
            attachResultButtons(resultsContent);
            container.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (err) {
            console.error('renderCodeUnderstandingResults error', err);
        }
    }

    function renderResults(containerId, title, content) {
        try {
            const container = document.getElementById(containerId) || document.getElementById('search-results');
            if (!container) { console.error('Container not found:', containerId); return; }
            const resultsContent = container.querySelector('.results-content');
            if (!resultsContent) { console.error('Results content not found in:', containerId); return; }
            const resultsTitle = container.querySelector('.results-title');
            if (resultsTitle) resultsTitle.textContent = title;

            if (typeof content === 'object') {
                if (content.files && Array.isArray(content.files)) {
                    renderFileList(resultsContent, content.files, title);
                } else if (content.summary) {
                    renderSearchResults(resultsContent, content, title);
                } else if (content.type === 'semanticSearchResults' || content.type === 'semanticResults') {
                    // if content is already normalized semantic results
                    // call the higher-level renderer using the container element id
                    const containerElement = container;
                    renderSemanticSearchResults(containerElement.id, content);
                } else if (content.type === 'codeUnderstandingResults') {
                    renderCodeUnderstandingResultsContent(resultsContent, content, title);
                } else {
                    renderObjectOutput(resultsContent, content, title);
                }
            } else {
                renderTextOutput(resultsContent, content, title);
            }

            container.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (err) {
            console.error('renderResults error', err);
        }
    }

    // Basic implementations for renderFileList/renderSearchResults used by renderResults
    function renderFileList(container, files, title) {
        try {
            if (!files || files.length === 0) {
                container.innerHTML = '<div class="empty-state"><div class="icon">📭</div><div class="message">No files found</div></div>';
                return;
            }
            let html = '<div class="file-list">';
            files.forEach(file => {
                const escapedFilePath = escapeHtml(file.filePath || '');
                const escapedFileName = escapeHtml(file.fileName || escapedFilePath.split(/[\\/]/).pop() || '');
                const languageIcon = getLanguageIcon(file.language || 'unknown');
                html += '<div class="file-item" data-file-path="' + escapedFilePath + '">' +
                    '<div class="file-icon">' + languageIcon + '</div>' +
                    '<div class="file-content">' +
                    '<div class="file-name">' + escapedFileName + '</div>' +
                    '<div class="file-path">' + escapedFilePath + '</div>' +
                    '</div>' +
                    '<div class="file-actions"><button class="file-action" data-file-path="' + escapedFilePath + '">📂</button></div>' +
                    '</div>';
            });
            html += '</div>';
            container.innerHTML = html;
            container.querySelectorAll('.file-action').forEach(btn => {
                safeAddListener(btn, 'click', (e) => {
                    e.stopPropagation();
                    const filePath = btn.getAttribute('data-file-path');
                    postToExtension({ command: 'openFile', path: filePath });
                });
            });
        } catch (err) {
            console.error('renderFileList error', err);
        }
    }

    function renderSearchResults(container, data, title) {
        try {
            let html = '<div class="analysis-summary">' + escapeHtml(data.summary || '') + '</div>';
            if (Array.isArray(data.files)) {
                html += '<div class="file-list" style="margin-top: 8px;">';
                data.files.forEach(file => {
                    const escapedFilePath = escapeHtml(file.filePath || '');
                    const escapedFileName = escapeHtml(file.fileName || escapedFilePath.split(/[\\/]/).pop() || '');
                    const languageIcon = getLanguageIcon(file.language || 'unknown');
                    html += '<div class="file-item" data-file-path="' + escapedFilePath + '">' +
                        '<div class="file-icon">' + languageIcon + '</div>' +
                        '<div class="file-content">' +
                        '<div class="file-name">' + escapedFileName + '</div>' +
                        '<div class="file-path">' + escapedFilePath + '</div>' +
                        '</div>' +
                        '<div class="file-actions"><button class="file-action" data-file-path="' + escapedFilePath + '">📂</button></div>' +
                        '</div>';
                });
                html += '</div>';
            }
            container.innerHTML = html;
        } catch (err) {
            console.error('renderSearchResults error', err);
        }
    }

    function renderSemanticSearchResultsContent(container, data, title) {
        try {
            container.innerHTML = formatSemanticSearchResults(data);
            attachResultButtons(container);
        } catch (err) {
            console.error('renderSemanticSearchResultsContent error', err);
        }
    }

    function renderCodeUnderstandingResultsContent(container, data, title) {
        try {
            container.innerHTML = formatCodeUnderstandingResults(data);
            attachResultButtons(container);
        } catch (err) {
            console.error('renderCodeUnderstandingResultsContent error', err);
        }
    }

    function renderTextOutput(container, text, title) {
        try {
            container.innerHTML = '<div class="analysis-result info">' + formatContent(text) + '</div>';
        } catch (err) {
            console.error('renderTextOutput error', err);
        }
    }

    function renderObjectOutput(container, data, title) {
        try {
            const jsonString = JSON.stringify(data, null, 2);
            container.innerHTML = '<div class="analysis-result info"><div class="result-content"><pre class="json-output">' + escapeHtml(jsonString) + '</pre></div></div>';
        } catch (err) {
            console.error('renderObjectOutput error', err);
        }
    }

    function updateFileSelector(files) {
        try {
            const fileSelector = document.getElementById('file-selector');
            if (!fileSelector) return;

            // Clear existing options except the first two
            while (fileSelector.options.length > 2) fileSelector.remove(2);

            (files || []).slice(0, 50).forEach(file => {
                const option = document.createElement('option');
                option.value = file.path || '';
                option.textContent = (file.label || file.path || '').toString();
                fileSelector.appendChild(option);
            });
        } catch (err) {
            console.error('updateFileSelector error', err);
        }
    }

    // -------------------------
    // State persistence
    // -------------------------
    function persistState() {
        try {
            vscode.setState(state);
        } catch (err) {
            console.error('persistState error', err);
        }
    }

    // -------------------------
    // Utilities & boot
    // -------------------------
    // expose a minimal API for debug if needed
    window.__sidebarDebug = window.__sidebarDebug || {};
    window.__sidebarDebug.postToExtension = postToExtension;
    window.__sidebarDebug.getState = () => JSON.parse(JSON.stringify(state));

    // Start up
    initialize();

    // Global error handlers to surface issues to users
    window.onerror = function(message) {
        try { showNotification(`Sidebar UI error: ${escapeHtml(message || '')}`, 'error'); } catch (e) { console.error(e); }
        return false;
    };
    window.addEventListener('unhandledrejection', function(event) {
        try { showNotification(`Sidebar unexpected error: ${escapeHtml(String(event.reason || ''))}`, 'error'); } catch (e) { console.error(e); }
    });

    // Expose handleExtensionMessage for unit tests or external invocations if needed
    window.__handleExtensionMessage = handleExtensionMessage;
})();