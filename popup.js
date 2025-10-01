class ArticleAnalyzer {
    constructor() {
        this.apiKey = '';
        this.pageContent = '';
        this.init();
    }

    async init() {
        await this.loadApiKey();
        this.setupEventListeners();
        await this.extractPageContent();
    }

    async loadApiKey() {
        const result = await chrome.storage.sync.get(['geminiApiKey']);
        if (result.geminiApiKey) {
            this.apiKey = result.geminiApiKey;
            document.getElementById('apiKey').value = this.apiKey;
        }
    }

    async saveApiKey() {
        await chrome.storage.sync.set({ geminiApiKey: this.apiKey });
    }

    setupEventListeners() {
        const apiKeyInput = document.getElementById('apiKey');
        const summarizeBtn = document.getElementById('summarizeBtn');
        const extractBtn = document.getElementById('extractBtn');
        const askBtn = document.getElementById('askBtn');
        const questionInput = document.getElementById('questionInput');

        apiKeyInput.addEventListener('input', (e) => {
            this.apiKey = e.target.value;
            this.saveApiKey();
        });

        summarizeBtn.addEventListener('click', () => this.summarizeContent());
        extractBtn.addEventListener('click', () => this.showExtractedContent());
        askBtn.addEventListener('click', () => this.askQuestion());

        questionInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
                this.askQuestion();
            }
        });
    }

    async extractPageContent() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                function: this.extractContentFromPage
            });

            if (results && results[0] && results[0].result) {
                this.pageContent = results[0].result.content;
                this.updateStatus(`Extracted ${results[0].result.wordCount} words from page`);
            } else {
                this.updateStatus('Could not extract content from page');
            }
        } catch (error) {
            console.error('Error extracting content:', error);
            this.updateStatus('Error extracting page content');
        }
    }

    extractContentFromPage() {
        // Remove script and style elements
        const scripts = document.querySelectorAll('script, style, nav, header, footer, aside, .sidebar, .menu, .navigation');
        scripts.forEach(el => el.remove());

        // Try to find article content using common selectors
        const contentSelectors = [
            'article',
            '[role="main"]',
            '.post-content',
            '.article-content',
            '.entry-content',
            '.content',
            '.post-body',
            '.article-body',
            'main',
            '.main-content'
        ];

        let content = '';
        
        for (const selector of contentSelectors) {
            const element = document.querySelector(selector);
            if (element) {
                content = element.innerText || element.textContent || '';
                break;
            }
        }

        // Fallback to body content if no article content found
        if (!content || content.length < 200) {
            content = document.body.innerText || document.body.textContent || '';
        }

        // Clean up the content
        content = content
            .replace(/\s+/g, ' ')
            .replace(/\n\s*\n/g, '\n')
            .trim();

        // Limit content length to avoid API limits
        if (content.length > 50000) {
            content = content.substring(0, 50000) + '...';
        }

        return {
            content: content,
            wordCount: content.split(/\s+/).length,
            title: document.title
        };
    }

    async callGeminiAPI(prompt) {
        if (!this.apiKey) {
            throw new Error('Please enter your Gemini API key');
        }

        if (!this.pageContent) {
            throw new Error('No content extracted from page');
        }

        const fullPrompt = `${prompt}\n\nContent to analyze:\n${this.pageContent}`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${this.apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: fullPrompt
                    }]
                }],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 2048,
                }
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || `HTTP ${response.status}`);
        }

        const data = await response.json();
        
        if (data.candidates && data.candidates[0] && data.candidates[0].content) {
            return data.candidates[0].content.parts[0].text;
        } else {
            throw new Error('Unexpected API response format');
        }
    }

    async summarizeContent() {
        try {
            this.updateStatus('Generating summary...');
            this.setLoading(true);

            const prompt = `Please provide a comprehensive summary of this article. Include:
1. Main topic and key points
2. Important details and findings
3. Conclusions or implications
4. Any notable quotes or statistics

Keep the summary informative but concise.`;

            const summary = await this.callGeminiAPI(prompt);
            this.displayResponse(summary);
            this.updateStatus('Summary generated');
        } catch (error) {
            this.displayError(error.message);
            this.updateStatus('Error generating summary');
        } finally {
            this.setLoading(false);
        }
    }

    async askQuestion() {
        const question = document.getElementById('questionInput').value.trim();
        
        if (!question) {
            this.displayError('Please enter a question');
            return;
        }

        try {
            this.updateStatus('Analyzing question...');
            this.setLoading(true);

            const prompt = `Based on the provided content, please answer this question: ${question}

Please provide a detailed and accurate response based only on the information in the content. If the content doesn't contain enough information to answer the question, please say so.`;

            const response = await this.callGeminiAPI(prompt);
            this.displayResponse(response);
            this.updateStatus('Question answered');
        } catch (error) {
            this.displayError(error.message);
            this.updateStatus('Error answering question');
        } finally {
            this.setLoading(false);
        }
    }

    showExtractedContent() {
        if (this.pageContent) {
            const preview = this.pageContent.length > 2000 
                ? this.pageContent.substring(0, 2000) + '...'
                : this.pageContent;
            this.displayResponse(`Extracted Content:\n\n${preview}`);
            this.updateStatus(`Showing ${this.pageContent.split(/\s+/).length} words`);
        } else {
            this.displayError('No content extracted');
        }
    }

    updateStatus(message) {
        document.getElementById('status').textContent = message;
    }

    setLoading(isLoading) {
        const buttons = document.querySelectorAll('button');
        buttons.forEach(btn => btn.disabled = isLoading);
        
        if (isLoading) {
            this.displayResponse('🤔 Analyzing content...');
        }
    }

    displayResponse(content) {
        const responseContent = document.getElementById('responseContent');
        responseContent.textContent = content;
        responseContent.className = 'response-content';
    }

    displayError(message) {
        const responseContent = document.getElementById('responseContent');
        responseContent.textContent = `Error: ${message}`;
        responseContent.className = 'response-content error';
    }
}

// Initialize when popup loads
document.addEventListener('DOMContentLoaded', () => {
    new ArticleAnalyzer();
});