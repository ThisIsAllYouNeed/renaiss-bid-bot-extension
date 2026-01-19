// Price Analyzer for Renaiss Marketplace
(function() {
    'use strict';
    console.log('Renaiss Price Analyzer content.js loaded.');

    const PRICE_THRESHOLD = 0.1; // 15% threshold
    let windowCount = 0; // Reset per batch/scan

    // Color configuration
    const COLORS = {
        GREEN: '#10b981',    // Listing price is 15%+ lower than FMV (good deal)
        RED: '#ef4444',      // Listing price is 15%+ higher than FMV (overpriced)
        GRAY: '#6b7280'      // Within 15% of FMV (neutral)
    };

    function openInBackgroundTab(url) {
        chrome.runtime.sendMessage(
            { action: 'openTab', url: url },
            (response) => {
                if (response && response.success) {
                    console.log('Tab opened successfully:', url);
                }
            }
        );
    }

    /**
     * Parses price string and returns numeric value
     * @param {string} priceStr - Price string like "$163.2"
     * @returns {number} - Numeric price value
     */
    function parsePrice(priceStr) {
        if (!priceStr) return 1000000;
        if (priceStr === "unlisted") return 10000000;
        const cleaned = priceStr.replace(/[$,]/g, '');
        return parseFloat(cleaned) || 0;
    }

    /**
     * Calculates price comparison and returns appropriate color
     * @param {number} listingPrice - The asking price
     * @param {number} fmvPrice - The fair market value
     * @param {number} lastTradedPrice - The last traded price
     * @returns {object} - { color, percentage, status }
     */
    function calculatePriceStatus(listingPrice, fmvPrice, lastTradedPrice) {
        if (fmvPrice === 0) {
            return { color: COLORS.GRAY, percentage: 0, status: 'No FMV' };
        }

        const priceDifference = (listingPrice - fmvPrice) / fmvPrice;

        // Condition for high last traded price.
        if (lastTradedPrice && lastTradedPrice > fmvPrice * 1.1) {
            return {
                color: COLORS.GREEN,
                percentage: (priceDifference * 100).toFixed(1),
                status: 'High recent sale'
            };
        }

        if (listingPrice && priceDifference <= -PRICE_THRESHOLD) {
            return {
                color: COLORS.GREEN,
                percentage: (priceDifference * 100).toFixed(1),
                status: 'Good Deal'
            };
        } else if (priceDifference >= PRICE_THRESHOLD) {
            return {
                color: COLORS.RED,
                percentage: (priceDifference * 100).toFixed(1),
                status: 'Overpriced'
            };
        } else {
            return {
                color: COLORS.GRAY,
                percentage: (priceDifference * 100).toFixed(1),
                status: 'Fair Price'
            };
        }
    }

    /**
     * Adds price analysis indicator to a card
     * @param {HTMLElement} card - Card element to analyze
     */
    async function analyzeCard(card) {
        console.log('analyzeCard: Processing card element:', card); // Logs the actual element
        try {
            // Check if this card has already been processed (has indicator, meaning window was opened)
            if (card.querySelector('[data-price-indicator]')) {
                console.log('analyzeCard: Card already has indicator, skipping.');
                return;
            }

            // Extract token_id
            const cardLink = card.querySelector('a[href*="/card/"]');
            let tokenId = 'N/A';
            if (cardLink) {
                const href = cardLink.getAttribute('href');
                const match = href.match(/\/card\/([^/]+)/);
                if (match && match[1]) {
                    tokenId = match[1];
                    console.log('analyzeCard: Extracted Token ID:', tokenId);
                }
            }

            // Extract card name (assuming it's in the second div's span)
            const cardNameEl = card.querySelector('div:nth-child(2) span'); // This selects the span within the second div child of the card
            let cardName = 'N/A';
            if (cardNameEl) {
                cardName = cardNameEl.textContent.trim();
                console.log('analyzeCard: Extracted Card Name:', cardName);
            }

            // Using selectors derived from user feedback.
            // The listing price is a span inside the first child of a specific div.
            const listingPriceEl = card.querySelector('.p-3 > div > div:nth-child(1) > span');
            // The FMV is a span within a specific div, using an attribute selector for the complex class name.
            const fmvPriceEl = card.querySelector('div[class*="bg-white/20"] > span.text-xs.font-medium.text-white');

            console.log('analyzeCard: listingPriceEl found:', !!listingPriceEl, listingPriceEl);
            console.log('analyzeCard: fmvPriceEl found:', !!fmvPriceEl, fmvPriceEl);

            if (listingPriceEl && fmvPriceEl) {
                const listingPrice = parsePrice(listingPriceEl.textContent);
                const fmvPrice = parsePrice(fmvPriceEl.textContent);
                console.log('analyzeCard: Extracted prices - Listing:', listingPrice, 'FMV:', fmvPrice);

                let lastTradedPrice = 0;
                if (tokenId !== 'N/A') {
                    try {
                        const response = await fetch(`https://localhost:8000/query_trade?token_id=${tokenId}`);
                        if (response.ok) {
                            const tradeData = await response.json();
                            // Assuming the API returns something like { "price": "123.45" }
                            if (tradeData && tradeData.price) {
                                lastTradedPrice = parsePrice(tradeData.price.toString());
                                console.log('analyzeCard: Fetched last traded price:', lastTradedPrice);
                            }
                        }
                    } catch (error) {
                        console.error('Error fetching trade data:', error);
                    }
                }

                if (fmvPrice > 0) {
                    const status = calculatePriceStatus(listingPrice, fmvPrice, lastTradedPrice);
                    console.log('analyzeCard: Price Status:', status.status, 'Percentage:', status.percentage);

                    // Create and add the indicator
                    let indicator = document.createElement('div');
                    indicator.setAttribute('data-price-indicator', 'true');

                    // Ensure the parent is positioned to contain the indicator
                    if (window.getComputedStyle(card).position === 'static') {
                        card.style.position = 'relative';
                    }

                    // Add indicator styling
                    const style = `
            position: absolute;
            top: 10px;
            right: 10px;
            width: 48px;
            height: 48px;
            border-radius: 50%;
            border: 2px solid white;
            cursor: pointer;
            z-index: 10;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            transition: all 0.2s ease;
          `;

                    indicator.style.cssText = style;
                    card.appendChild(indicator);

                    // Update indicator color and add a tooltip
                    indicator.style.backgroundColor = status.color;
                    indicator.title = `${status.status}: ${status.percentage}% vs FMV ($${fmvPrice.toFixed(2)})`;
                    if (status.status === 'High recent sale') {
                        indicator.title += ` | Last Sale: $${lastTradedPrice.toFixed(2)}`;
                    }
                    console.log('analyzeCard: Indicator created for card.');

                    // Open window only if we haven't hit the 20 limit yet
                    if (tokenId !== 'N/A') {
                        openInBackgroundTab(`https://www.renaiss.xyz/card/${tokenId}`);
                    }

                } else {
                    console.log('analyzeCard: Invalid prices (0 or less), skipping indicator creation.');
                }
            } else {
                console.log('analyzeCard: Could not find both price elements for card.');
            }
        } catch (error) {
            console.error('analyzeCard: Error analyzing card:', error, card);
        }
    }

    /**
     * Initializes the extension by finding and analyzing all cards
     */
    async function initializeAnalyzer() {
        console.log('initializeAnalyzer: Starting scan...');
        const cardSelector = 'div.rounded-xl.overflow-hidden.relative';
        console.log('initializeAnalyzer: Using card selector:', cardSelector);
        let cards = [];
        try {
            cards = document.querySelectorAll(cardSelector);
        } catch (error) {
            console.error('Error selecting cards with selector:', cardSelector, error);
        }
        console.log('initializeAnalyzer: Found', cards.length, 'cards.');

        let processedCount = 0;
        for (let i = 0; i < cards.length; i++) {
            const card = cards[i];
            // Only process if it looks like it has price information and hasn't been processed (no indicator yet)
            if (card.textContent.includes('$') && !card.querySelector('[data-price-indicator]')) {
                await analyzeCard(card);
                processedCount++;

                // Wait 1 second before processing the next card
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        console.log('initializeAnalyzer: Processed', processedCount, 'cards.');
    }


    // Listen for messages from the popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        console.log('Message received:', request);
        if (request.action === 'reload') {
            console.log('Re-scanning page due to manual reload...');
            initializeAnalyzer();
            sendResponse({ status: 'reloading' });
        }
        return true; // Indicates an asynchronous response
    });

    // Run the analyzer when the script is first injected or re-injected.
    initializeAnalyzer();

})();
