document.addEventListener('DOMContentLoaded', () => {
    const riskTakerCheckbox = document.getElementById('risk-taker-checkbox');
    const dontCloseCheckbox = document.getElementById('dont-close-checkbox');

    // Load saved settings
    chrome.storage.local.get(['isRiskTaker', 'dontCloseWindow'], (result) => {
        riskTakerCheckbox.checked = result.isRiskTaker; // Default to true
        dontCloseCheckbox.checked = result.dontCloseWindow;
    });

    // Save settings on change
    riskTakerCheckbox.addEventListener('change', (event) => {
        chrome.storage.local.set({ isRiskTaker: event.target.checked });
    });

    dontCloseCheckbox.addEventListener('change', (event) => {
        chrome.storage.local.set({ dontCloseWindow: event.target.checked });
    });

    // Load and display saved address
    const userAddressInput = document.getElementById('userAddress');
    const addressSavedSpan = document.getElementById('addressSaved');

    if (!userAddressInput || !addressSavedSpan) {
        console.error('Required DOM elements not found for address input');
        return;
    }

    chrome.storage.local.get(['userAddress'], (result) => {
        if (chrome.runtime.lastError) {
            console.error('Failed to load address:', chrome.runtime.lastError);
            return;
        }
        if (result.userAddress) {
            userAddressInput.value = result.userAddress;
            addressSavedSpan.classList.add('show');
            addressSavedSpan.textContent = '✓ Saved';
        }
    });

    // Save address whenever user types
    userAddressInput.addEventListener('input', () => {
        const address = userAddressInput.value.trim();
        chrome.storage.local.set({ userAddress: address }, () => {
            if (chrome.runtime.lastError) {
                console.error('Failed to save address:', chrome.runtime.lastError);
            }
        });

        // Show/hide the saved indicator
        if (address) {
            addressSavedSpan.classList.add('show');
            addressSavedSpan.textContent = '✓ Saved';
        } else {
            addressSavedSpan.classList.remove('show');
            addressSavedSpan.textContent = '';
        }
    });

    document.getElementById('reloadButton').addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0] && tabs[0].id) {
                chrome.tabs.sendMessage(tabs[0].id, { action: 'reload' }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error(chrome.runtime.lastError.message);
                    } else if (response) {
                        console.log('Reload response:', response);
                    }
                });
            }
        });
    });
});

/**
 * NFT Listener Status Updates
 */

const STATUS_COLORS = {
    connected: '#10b981',    // Green
    disconnected: '#9ca3af',  // Gray
    connecting: '#f59e0b',    // Amber
    failed: '#ef4444'         // Red
};

const STATUS_LABELS = {
    connected: 'Connected',
    disconnected: 'Disconnected',
    connecting: 'Connecting...',
    failed: 'Connection Failed'
};

/**
 * Update popup with current status from storage
 */
async function updatePopupStatus() {
    try {
        console.log('[Popup] === Updating status from storage ===');
        const result = await chrome.storage.local.get('nft-listener-status');
        console.log('[Popup] Storage result:', result);

        const status = result['nft-listener-status'];
        console.log('[Popup] Status object:', status);

        if (!status) {
            console.log('[Popup] ⚠️  WARNING: No status data available yet!');
            console.log('[Popup] This means nftListener.updateStorageStatus() has not been called');
            console.log('[Popup] Possible causes:');
            console.log('[Popup] 1. Service worker is not running (check Chrome DevTools → Extensions page)');
            console.log('[Popup] 2. Marketplace-nft-listener content script is not loaded (make sure you are on /marketplace page)');
            console.log('[Popup] 3. Content script did not send start-nft-listening message to service worker');
            console.log('[Popup] 4. Message was sent but service worker did not respond');
            return;
        }

        console.log('[Popup] ✓ Status data found:');
        console.log('[Popup] - connectionStatus:', status.connectionStatus);
        console.log('[Popup] - activeEndpoint:', status.activeEndpoint);
        console.log('[Popup] - isListening:', status.isListening);
        console.log('[Popup] - listeningTabsCount:', status.listeningTabsCount);

        // Update connection indicator
        const indicator = document.getElementById('connection-indicator');
        const connectionText = document.getElementById('connection-text');

        if (indicator && connectionText) {
            const color = STATUS_COLORS[status.connectionStatus] || STATUS_COLORS.disconnected;
            const label = STATUS_LABELS[status.connectionStatus] || 'Unknown';

            indicator.style.backgroundColor = color;
            connectionText.textContent = label;
            connectionText.style.color = color;
        }

        // Update endpoint info
        const endpointValue = document.getElementById('endpoint-value');
        if (endpointValue) {
            if (status.activeEndpoint) {
                endpointValue.textContent = status.activeEndpoint;
            } else {
                endpointValue.textContent = 'None';
            }
        }

        // Update last event info
        const lastEventValue = document.getElementById('last-event-value');
        if (lastEventValue) {
            if (status.lastTransferEvent) {
                const event = status.lastTransferEvent;
                const timestamp = new Date(event.timestamp).toLocaleTimeString();
                lastEventValue.innerHTML = `Token ID: <strong>${event.tokenId}</strong><br/>Time: ${timestamp}`;
            } else {
                lastEventValue.textContent = 'No transfers detected';
            }
        }

        console.log('[Popup] ✓ UI updated successfully');
    } catch (error) {
        console.error('[Popup] ❌ Failed to update status:', error);
    }
}

// Update status when popup loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('[Popup] === DOMContentLoaded event fired ===');
    updatePopupStatus();
});

// Poll for status updates every 2 seconds while popup is open
console.log('[Popup] Setting up 2-second polling interval');
setInterval(() => {
    console.log('[Popup] === Polling interval triggered ===');
    updatePopupStatus();
}, 2000);

// Listen for storage changes to update popup in real-time
console.log('[Popup] Setting up storage change listener');
chrome.storage.onChanged.addListener((changes, areaName) => {
    console.log('[Popup] === Storage changed ===');
    console.log('[Popup] Area:', areaName);
    console.log('[Popup] Changes:', Object.keys(changes));

    if (areaName === 'local' && changes['nft-listener-status']) {
        console.log('[Popup] nft-listener-status changed, updating...');
        console.log('[Popup] Old value:', changes['nft-listener-status'].oldValue);
        console.log('[Popup] New value:', changes['nft-listener-status'].newValue);
        updatePopupStatus();
    } else if (areaName !== 'local') {
        console.log('[Popup] Ignoring storage change from different area:', areaName);
    } else {
        console.log('[Popup] Ignoring storage change for different key');
    }
});

console.log('[Popup] Popup script loaded and initialized');
