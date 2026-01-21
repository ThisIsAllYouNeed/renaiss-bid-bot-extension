# NFT Transfer Listener - Monitoring & Status Display

> Enhancement to add WebSocket connection status monitoring and popup display

**Goal:** Add WebSocket connection status tracking and display current connection state, active endpoint, and last transfer event in the extension popup.

**Architecture:** Service worker tracks connection status, active endpoint, and last transfer event in chrome.storage. Popup reads and displays this information with visual indicators.

**Tech Stack:** Chrome Storage API, vanilla HTML/CSS, JavaScript

---

## Task 1: Enhance NFT Listener Module with Status Tracking

**Files:**
- Modify: `src/nft-listener.js`

**What to add:**

Update the NFTListener class to track connection status, endpoint, and transfer events:

```javascript
class NFTListener {
    constructor() {
        this.provider = null;
        this.contract = null;
        this.isListening = false;
        this.listener = null;
        this.tabs = new Set();

        // NEW: Status tracking
        this.connectionStatus = 'disconnected'; // 'connected', 'disconnected', 'connecting', 'failed'
        this.activeEndpoint = null;
        this.lastTransferEvent = null;
        this.connectionTimestamp = null;
    }

    async initializeProvider() {
        this.connectionStatus = 'connecting';
        await this.updateStorageStatus();

        try {
            const wsEndpoint = getNextWsEndpoint();

            if (wsEndpoint) {
                try {
                    console.log('[NFTListener] Attempting WebSocket connection:', wsEndpoint);
                    this.provider = new ethers.WebSocketProvider(wsEndpoint);
                    await this.provider.getNetwork();

                    // NEW: Record successful connection
                    this.connectionStatus = 'connected';
                    this.activeEndpoint = wsEndpoint;
                    this.connectionTimestamp = new Date().toISOString();
                    console.log('[NFTListener] WebSocket connection established:', wsEndpoint);

                    await this.updateStorageStatus();
                    return true;
                } catch (wsError) {
                    console.warn('[NFTListener] WebSocket failed, trying HTTP fallback:', wsError.message);
                }
            }

            const rpcEndpoint = getFallbackRpcEndpoint();
            console.log('[NFTListener] Using HTTP fallback:', rpcEndpoint);
            this.provider = new ethers.JsonRpcProvider(rpcEndpoint);
            await this.provider.getNetwork();

            // NEW: Record HTTP fallback connection
            this.connectionStatus = 'connected';
            this.activeEndpoint = rpcEndpoint + ' (HTTP Fallback)';
            this.connectionTimestamp = new Date().toISOString();
            console.log('[NFTListener] HTTP connection established');

            await this.updateStorageStatus();
            return true;
        } catch (error) {
            // NEW: Record failed connection
            this.connectionStatus = 'failed';
            this.activeEndpoint = null;
            console.error('[NFTListener] Failed to initialize provider:', error);

            await this.updateStorageStatus();
            return false;
        }
    }

    async onTransferDetected(from, to, tokenId) {
        const tokenIdStr = tokenId.toString();
        console.log('[NFTListener] Transfer detected - TokenID:', tokenIdStr, 'From:', from, 'To:', to);

        // NEW: Record last transfer event
        this.lastTransferEvent = {
            tokenId: tokenIdStr,
            from: from,
            to: to,
            timestamp: new Date().toISOString(),
            url: `https://www.renaiss.xyz/card/${tokenIdStr}`
        };

        await this.updateStorageStatus();

        if (this.tabs.size > 0) {
            for (const tabId of this.tabs) {
                try {
                    chrome.tabs.sendMessage(tabId, {
                        action: 'transfer-detected',
                        tokenId: tokenIdStr,
                        from: from,
                        to: to
                    });
                    console.log('[NFTListener] Sent transfer notification to tab', tabId);
                } catch (error) {
                    console.error('[NFTListener] Failed to send message to tab', tabId, error);
                    this.tabs.delete(tabId);
                }
            }
        }
    }

    // NEW: Update chrome.storage with current status
    async updateStorageStatus() {
        try {
            await chrome.storage.local.set({
                'nft-listener-status': {
                    connectionStatus: this.connectionStatus,
                    activeEndpoint: this.activeEndpoint,
                    lastTransferEvent: this.lastTransferEvent,
                    connectionTimestamp: this.connectionTimestamp,
                    listeningTabsCount: this.tabs.size,
                    isListening: this.isListening
                }
            });
            console.log('[NFTListener] Status updated in storage:', this.connectionStatus);
        } catch (error) {
            console.error('[NFTListener] Failed to update storage:', error);
        }
    }

    stopListening() {
        if (this.contract && this.listener) {
            this.contract.removeListener('Transfer', this.listener);
            this.isListening = false;

            // NEW: Update status when stopping
            this.connectionStatus = 'disconnected';
            this.updateStorageStatus();

            console.log('[NFTListener] Stopped listening to Transfer events');
        }
    }
}
```

**Step 1: Read current nft-listener.js**

Run: `head -50 /Users/pgi/renaiss-bid-bot-extension/src/nft-listener.js`

**Step 2: Enhance the class with status tracking**

Add the above status tracking properties to constructor and update the initializeProvider, onTransferDetected, and stopListening methods.

**Step 3: Commit**

```bash
git add src/nft-listener.js
git commit -m "feat: add connection status tracking to NFT listener module"
```

---

## Task 2: Update Popup HTML to Display Status

**Files:**
- Modify: `src/popup.html`

**What to add:**

Update the popup to show NFT listener status:

```html
<!-- Add this section to popup.html -->
<div id="nft-listener-status" style="padding: 16px; border-top: 1px solid #e5e7eb;">
    <div style="margin-bottom: 12px;">
        <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600;">NFT Listener Status</h3>
    </div>

    <div style="display: flex; align-items: center; margin-bottom: 12px;">
        <div id="connection-indicator" style="width: 12px; height: 12px; border-radius: 50%; margin-right: 8px; background-color: #9ca3af;"></div>
        <span id="connection-text" style="font-size: 13px; color: #6b7280;">Disconnected</span>
    </div>

    <div id="endpoint-info" style="font-size: 12px; color: #6b7280; margin-bottom: 12px; word-break: break-all;">
        <div style="font-weight: 500; margin-bottom: 4px;">Active Endpoint:</div>
        <div id="endpoint-value">None</div>
    </div>

    <div id="last-event-info" style="font-size: 12px; color: #6b7280;">
        <div style="font-weight: 500; margin-bottom: 4px;">Last Transfer:</div>
        <div id="last-event-value">No transfers detected</div>
    </div>
</div>
```

**Step 1: Read current popup.html**

Run: `cat /Users/pgi/renaiss-bid-bot-extension/src/popup.html`

**Step 2: Add the status section**

Add the NFT listener status section to the popup HTML.

**Step 3: Commit**

```bash
git add src/popup.html
git commit -m "feat: add NFT listener status display to popup"
```

---

## Task 3: Create Popup Script for Status Updates

**Files:**
- Create or Modify: `src/popup.js`

**What to add:**

```javascript
// src/popup.js
/**
 * Popup script for displaying NFT listener status
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
        const result = await chrome.storage.local.get('nft-listener-status');
        const status = result['nft-listener-status'];

        if (!status) {
            console.log('[Popup] No status data available yet');
            return;
        }

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

        console.log('[Popup] Status updated:', status);
    } catch (error) {
        console.error('[Popup] Failed to update status:', error);
    }
}

// Update status when popup loads
document.addEventListener('DOMContentLoaded', updatePopupStatus);

// Poll for status updates every 2 seconds while popup is open
setInterval(updatePopupStatus, 2000);

// Listen for storage changes to update popup in real-time
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes['nft-listener-status']) {
        console.log('[Popup] Storage changed, updating...');
        updatePopupStatus();
    }
});
```

**Step 1: Check if popup.js exists**

Run: `ls -la /Users/pgi/renaiss-bid-bot-extension/src/popup.js`

**Step 2: Create or update popup.js**

Add the status display script above.

**Step 3: Update manifest to include popup.js**

The popup.html needs to include this script:

```html
<script src="popup.js"></script>
```

**Step 4: Commit**

```bash
git add src/popup.js src/popup.html
git commit -m "feat: add real-time status display to extension popup"
```

---

## Task 4: Update Service Worker to Request Storage Permission

**Files:**
- Modify: `manifest.json`

**What to add:**

Ensure `storage` permission is in the manifest (it should already be there, verify):

```json
"permissions": [
    "activeTab",
    "storage",
    "scripting",
    "tabs"
]
```

If not present, add `"storage"` to the permissions array.

**Step 1: Verify storage permission exists**

Run: `grep -A 5 '"permissions"' /Users/pgi/renaiss-bid-bot-extension/manifest.json`

**Step 2: Add if missing**

If storage is not in permissions, add it.

**Step 3: Commit (if changes made)**

```bash
git add manifest.json
git commit -m "feat: ensure storage permission is enabled for status tracking"
```

---

## Summary

This enhancement adds:

1. **Status Tracking** - NFT listener tracks connection status, active endpoint, and last transfer event
2. **Chrome Storage** - Status persisted in chrome.storage.local for popup access
3. **Real-time Popup** - Popup displays status with color-coded indicators and auto-updates every 2 seconds
4. **Information Displayed:**
   - Connection status (Connected/Disconnected/Connecting/Failed) with color indicator
   - Active WebSocket endpoint or HTTP fallback endpoint
   - Last detected NFT transfer with token ID and timestamp

**Testing:**
- Open extension popup and observe status updates
- Navigate to marketplace to trigger NFT listener
- Watch popup for real-time status changes
- Check browser console for detailed logs prefixed with [NFTListener] and [Popup]
