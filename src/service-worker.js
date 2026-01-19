// Service Worker for Renaiss Price Analyzer
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
