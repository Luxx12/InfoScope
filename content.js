function extractArticleContent() {
    // Remove unwanted elements
    const unwantedSelectors = [
        'script', 'style', 'nav', 'header', 'footer', 'aside',
        '.sidebar', '.menu', '.navigation', '.advertisement', '.ad',
        '.social-share', '.comments', '.related-articles',
        '[class*="ad-"]', '[id*="ad-"]', '.popup', '.modal'
    ];
    
    unwantedSelectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => {
            if (el.parentNode) {
                el.style.display = 'none'; // Hide instead of remove to avoid breaking layout
            }
        });
    });

    // Try to find main content using various selectors
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
        '.main-content',
        '.story-body',
        '.article-text'
    ];

    let bestContent = '';
    let bestScore = 0;

    for (const selector of contentSelectors) {
        const elements = document.querySelectorAll(selector);
        
        elements.forEach(element => {
            const text = element.innerText || element.textContent || '';
            const wordCount = text.split(/\s+/).length;
            
            // Score based on word count and element specificity
            let score = wordCount;
            if (selector === 'article') score *= 1.5;
            if (selector.includes('content')) score *= 1.3;
            if (selector.includes('article')) score *= 1.3;
            
            if (score > bestScore && wordCount > 50) {
                bestScore = score;
                bestContent = text;
            }
        });
    }

    // Fallback to body content if no good content found
    if (!bestContent || bestContent.length < 200) {
        bestContent = document.body.innerText || document.body.textContent || '';
    }

    return bestContent;
}

// Listen for messages from the popup
chrome.runtime.onMessage?.addListener((request, sender, sendResponse) => {
    if (request.action === 'extractContent') {
        try {
            const content = extractArticleContent();
            sendResponse({
                success: true,
                content: content,
                title: document.title,
                url: window.location.href
            });
        } catch (error) {
            sendResponse({
                success: false,
                error: error.message
            });
        }
    }
    
    return true; // Keep message channel open for async response
});

// Highlight text feature (optional enhancement)
function highlightText(text) {
    if (!text) return;
    
    const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null,
        false
    );
    
    let node;
    const nodes = [];
    
    while (node = walker.nextNode()) {
        if (node.nodeValue.toLowerCase().includes(text.toLowerCase())) {
            nodes.push(node);
        }
    }
    
    nodes.forEach(node => {
        const parent = node.parentElement;
        if (parent && !parent.classList.contains('analyzer-highlight')) {
            const highlighted = node.nodeValue.replace(
                new RegExp(text, 'gi'),
                '<span class="analyzer-highlight" style="background-color: yellow; padding: 2px;">$&</span>'
            );
            
            const newElement = document.createElement('span');
            newElement.innerHTML = highlighted;
            parent.replaceChild(newElement, node);
        }
    });
}

// Add some basic styling for the extension
const style = document.createElement('style');
style.textContent = `
    .analyzer-highlight {
        background-color: #ffeb3b !important;
        padding: 2px 4px !important;
        border-radius: 2px !important;
        animation: highlight-fade 3s ease-out !important;
    }
    
    @keyframes highlight-fade {
        0% { background-color: #ff9800; }
        100% { background-color: #ffeb3b; }
    }
`;
document.head.appendChild(style);