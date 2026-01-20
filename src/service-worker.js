// Service Worker for Renaiss Price Analyzer
import { nftListener } from './nft-listener.js';

console.log('Service Worker loaded');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Service Worker received message:', request);

    if (request.action === 'openTab') {
        chrome.tabs.create(
            { url: request.url, active: false },
            (tab) => {
                console.log('Opened background tab:', tab.id, request.url);
                sendResponse({ success: true });
            }
        );
        return true; // Indicates async response
    }
});

// Handle messages from marketplace content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[ServiceWorker] Received message:', request.action);

    if (request.action === 'start-nft-listening') {
        const tabId = sender.tab.id;
        nftListener.registerTab(tabId);

        // Start listening if not already active
        if (!nftListener.isListening) {
            nftListener.startListening().then((success) => {
                sendResponse({
                    success: success,
                    message: success ? 'NFT listening started' : 'Failed to start listening'
                });
            });
            return true; // Indicate async response
        } else {
            sendResponse({ success: true, message: 'NFT listening already active' });
        }
    } else if (request.action === 'stop-nft-listening') {
        const tabId = sender.tab.id;
        nftListener.unregisterTab(tabId);

        // Stop listening if no more tabs are active
        if (!nftListener.hasActiveTabs()) {
            nftListener.stopListening();
        }

        sendResponse({ success: true, message: 'NFT listening stopped' });
    }

    return true;
});

// Clean up when tabs close
chrome.tabs.onRemoved.addListener((tabId) => {
    if (nftListener.tabs.has(tabId)) {
        nftListener.unregisterTab(tabId);
        if (!nftListener.hasActiveTabs()) {
            nftListener.stopListening();
        }
    }
});
