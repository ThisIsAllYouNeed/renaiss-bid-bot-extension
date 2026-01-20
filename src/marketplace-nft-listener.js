// src/marketplace-nft-listener.js
/**
 * Marketplace NFT Transfer Listener Content Script
 * Runs on the /marketplace page and handles NFT transfer notifications
 */

(function() {
    'use strict';
    console.log('[MarketplaceNFTListener] Content script loaded on marketplace page');

    /**
     * Open a URL in a background tab
     * Uses existing chrome.runtime.sendMessage pattern from price-analyzer.js
     * @param {string} url - URL to open
     */
    function openInBackgroundTab(url) {
        chrome.runtime.sendMessage(
            { action: 'openTab', url: url },
            (response) => {
                if (response && response.success) {
                    console.log('[MarketplaceNFTListener] Tab opened successfully:', url);
                } else {
                    console.error('[MarketplaceNFTListener] Failed to open tab:', url);
                }
            }
        );
    }

    /**
     * Request the service worker to start listening for NFT transfers
     */
    function startListening() {
        console.log('[MarketplaceNFTListener] Sending start-nft-listening message to service worker...');
        chrome.runtime.sendMessage(
            { action: 'start-nft-listening' },
            (response) => {
                if (chrome.runtime.lastError) {
                    console.error('[MarketplaceNFTListener] Chrome runtime error:', chrome.runtime.lastError);
                    return;
                }
                console.log('[MarketplaceNFTListener] Received response from service worker:', response);
                if (response && response.success) {
                    console.log('[MarketplaceNFTListener] NFT listening started:', response.message);
                } else {
                    console.error('[MarketplaceNFTListener] Failed to start listening:', response?.message, 'Full response:', response);
                }
            }
        );
    }

    /**
     * Request the service worker to stop listening
     */
    function stopListening() {
        chrome.runtime.sendMessage(
            { action: 'stop-nft-listening' },
            (response) => {
                if (response && response.success) {
                    console.log('[MarketplaceNFTListener] NFT listening stopped');
                } else {
                    console.error('[MarketplaceNFTListener] Failed to stop listening');
                }
            }
        );
    }

    /**
     * Listen for transfer notifications from service worker
     */
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'transfer-detected') {
            const tokenId = request.tokenId;
            const cardUrl = `https://www.renaiss.xyz/card/${tokenId}`;

            console.log('[MarketplaceNFTListener] Transfer detected - Opening card:', cardUrl);
            openInBackgroundTab(cardUrl);

            sendResponse({ success: true });
        }
        return true;
    });

    // Start listening when the script loads
    startListening();

    // Stop listening when page unloads (optional, helps clean up)
    window.addEventListener('beforeunload', () => {
        console.log('[MarketplaceNFTListener] Page unloading, stopping listener');
        stopListening();
    });

})();
