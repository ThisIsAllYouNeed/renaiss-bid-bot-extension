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
    console.log('[ServiceWorker] === Received message ===');
    console.log('[ServiceWorker] Message action:', request.action);
    console.log('[ServiceWorker] Sender tab ID:', sender.tab?.id);
    console.log('[ServiceWorker] Sender URL:', sender.url);

    if (request.action === 'start-nft-listening') {
        console.log('[ServiceWorker] Processing start-nft-listening request...');
        const tabId = sender.tab.id;
        console.log('[ServiceWorker] Registering tab:', tabId);

        nftListener.registerTab(tabId);
        console.log('[ServiceWorker] Tab registered. Current listening tabs count:', nftListener.tabs.size);
        console.log('[ServiceWorker] nftListener.isListening:', nftListener.isListening);

        // Start listening if not already active
        if (!nftListener.isListening) {
            console.log('[ServiceWorker] Not listening yet, calling startListening()...');
            nftListener.startListening().then((success) => {
                console.log('[ServiceWorker] startListening() returned:', success);
                console.log('[ServiceWorker] Sending response to content script...');
                sendResponse({
                    success: success,
                    message: success ? 'NFT listening started' : 'Failed to start listening'
                });
            }).catch((error) => {
                console.error('[ServiceWorker] startListening() threw error:', error);
                sendResponse({
                    success: false,
                    message: 'Error starting listening: ' + error.message
                });
            });
            return true; // Indicate async response
        } else {
            console.log('[ServiceWorker] Already listening, sending immediate response');
            sendResponse({ success: true, message: 'NFT listening already active' });
        }
    } else if (request.action === 'stop-nft-listening') {
        console.log('[ServiceWorker] Processing stop-nft-listening request...');
        const tabId = sender.tab.id;
        nftListener.unregisterTab(tabId);
        console.log('[ServiceWorker] Tab unregistered. Remaining tabs:', nftListener.tabs.size);

        // Stop listening if no more tabs are active
        if (!nftListener.hasActiveTabs()) {
            console.log('[ServiceWorker] No more active tabs, stopping listener');
            nftListener.stopListening();
        } else {
            console.log('[ServiceWorker] Still have active tabs, keeping listener active');
        }

        sendResponse({ success: true, message: 'NFT listening stopped' });
    } else {
        console.log('[ServiceWorker] Unknown action:', request.action);
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
