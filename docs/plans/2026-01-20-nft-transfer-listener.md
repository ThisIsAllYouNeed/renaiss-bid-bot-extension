# NFT Transfer Listener Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Listen to ERC721 NFT transfers on BSC chain and automatically open transferred NFTs in new tabs when user visits the marketplace.

**Architecture:** Service worker maintains persistent WebSocket connection to BSC blockchain using ethers.js and listens for Transfer events from the contract. Marketplace content script requests listening to start and opens new tabs when transfers are detected.

**Tech Stack:** ethers.js (v6), Chrome Extension APIs, BSC blockchain, WebSocket

---

## Task 1: Create WebSocket Configuration File

**Files:**
- Create: `src/ws-config.js`

**Step 1: Write WebSocket endpoint pool configuration**

```javascript
// src/ws-config.js
/**
 * WebSocket endpoints for BSC blockchain connection
 * Endpoints should be added during research phase
 */
export const WS_ENDPOINTS = {
    pools: [
        // Add WebSocket endpoints here
        // Example: 'wss://bsc-ws-node.nariox.org:443'
    ],
    fallbackRpc: 'https://bsc-dataseed.binance.org/', // HTTP fallback if all WS fail
    currentIndex: 0
};

/**
 * Get the next WebSocket endpoint in round-robin fashion
 * @returns {string|null} WebSocket endpoint URL or null if no endpoints configured
 */
export function getNextWsEndpoint() {
    if (WS_ENDPOINTS.pools.length === 0) {
        console.warn('No WebSocket endpoints configured, will use HTTP fallback');
        return null;
    }
    const endpoint = WS_ENDPOINTS.pools[WS_ENDPOINTS.currentIndex];
    WS_ENDPOINTS.currentIndex = (WS_ENDPOINTS.currentIndex + 1) % WS_ENDPOINTS.pools.length;
    return endpoint;
}

/**
 * Get the HTTP fallback RPC endpoint
 * @returns {string} HTTP RPC endpoint URL
 */
export function getFallbackRpcEndpoint() {
    return WS_ENDPOINTS.fallbackRpc;
}
```

**Step 2: Verify file is created**

Run: `ls -la /Users/pgi/renaiss-bid-bot-extension/src/ws-config.js`
Expected: File exists with 0 errors

**Step 3: Commit**

```bash
cd /Users/pgi/renaiss-bid-bot-extension
git add src/ws-config.js
git commit -m "feat: add WebSocket endpoint pool configuration"
```

---

## Task 2: Add ethers.js Dependency

**Files:**
- Modify: `package.json`

**Step 1: Check current package.json**

Run: `cat /Users/pgi/renaiss-bid-bot-extension/package.json`

**Step 2: Install ethers.js**

Run: `cd /Users/pgi/renaiss-bid-bot-extension && npm install ethers`
Expected: `ethers` added to dependencies

**Step 3: Verify installation**

Run: `npm list ethers`
Expected: `ethers@6.x.x` listed in dependencies

**Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add ethers.js dependency for blockchain interaction"
```

---

## Task 3: Create NFT Transfer Listener Service Worker Module

**Files:**
- Create: `src/nft-listener.js`

**Step 1: Write the NFT listener module**

```javascript
// src/nft-listener.js
/**
 * NFT Transfer Listener Module
 * Manages blockchain connection and Transfer event listening
 */

import { ethers } from 'ethers';
import { getNextWsEndpoint, getFallbackRpcEndpoint } from './ws-config.js';

const CONTRACT_ADDRESS = '0xf8646a3ca093e97bb404c3b25e675c0394dd5b30';
const CHAIN_ID = 56; // BSC Chain ID

// ERC721 Transfer event signature: Transfer(address indexed from, address indexed to, uint256 indexed tokenId)
const TRANSFER_EVENT_ABI = [
    'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)'
];

class NFTListener {
    constructor() {
        this.provider = null;
        this.contract = null;
        this.isListening = false;
        this.listener = null;
        this.tabs = new Set(); // Track which tabs have requested listening
    }

    /**
     * Initialize provider with WebSocket or HTTP fallback
     * @returns {Promise<boolean>} Success status
     */
    async initializeProvider() {
        try {
            const wsEndpoint = getNextWsEndpoint();

            if (wsEndpoint) {
                try {
                    console.log('[NFTListener] Attempting WebSocket connection:', wsEndpoint);
                    this.provider = new ethers.WebSocketProvider(wsEndpoint);
                    await this.provider.getNetwork(); // Test connection
                    console.log('[NFTListener] WebSocket connection established');
                    return true;
                } catch (wsError) {
                    console.warn('[NFTListener] WebSocket failed, trying HTTP fallback:', wsError.message);
                }
            }

            // Fallback to HTTP
            const rpcEndpoint = getFallbackRpcEndpoint();
            console.log('[NFTListener] Using HTTP fallback:', rpcEndpoint);
            this.provider = new ethers.JsonRpcProvider(rpcEndpoint);
            await this.provider.getNetwork(); // Test connection
            console.log('[NFTListener] HTTP connection established');
            return true;
        } catch (error) {
            console.error('[NFTListener] Failed to initialize provider:', error);
            return false;
        }
    }

    /**
     * Start listening to Transfer events
     * @returns {Promise<boolean>} Success status
     */
    async startListening() {
        if (this.isListening) {
            console.log('[NFTListener] Already listening');
            return true;
        }

        try {
            if (!this.provider) {
                const initialized = await this.initializeProvider();
                if (!initialized) {
                    throw new Error('Failed to initialize provider');
                }
            }

            // Create contract instance with event filter
            this.contract = new ethers.Contract(
                CONTRACT_ADDRESS,
                TRANSFER_EVENT_ABI,
                this.provider
            );

            // Create a filter for all transfers from this contract
            const filter = this.contract.filters.Transfer();

            // Set up the event listener
            this.listener = (from, to, tokenId) => {
                this.onTransferDetected(from, to, tokenId);
            };

            this.contract.on(filter, this.listener);
            this.isListening = true;

            console.log('[NFTListener] Started listening to Transfer events on', CONTRACT_ADDRESS);
            return true;
        } catch (error) {
            console.error('[NFTListener] Failed to start listening:', error);
            this.isListening = false;
            return false;
        }
    }

    /**
     * Stop listening to Transfer events
     */
    stopListening() {
        if (this.contract && this.listener) {
            this.contract.removeListener('Transfer', this.listener);
            this.isListening = false;
            console.log('[NFTListener] Stopped listening to Transfer events');
        }
    }

    /**
     * Handle detected Transfer event
     * @param {string} from - Sender address
     * @param {string} to - Recipient address
     * @param {BigNumberish} tokenId - Token ID
     */
    async onTransferDetected(from, to, tokenId) {
        const tokenIdStr = tokenId.toString();
        console.log('[NFTListener] Transfer detected - TokenID:', tokenIdStr, 'From:', from, 'To:', to);

        // Broadcast to all listening marketplace tabs
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
                    this.tabs.delete(tabId); // Remove invalid tab
                }
            }
        }
    }

    /**
     * Register a tab as listening to transfers
     * @param {number} tabId - Chrome tab ID
     */
    registerTab(tabId) {
        this.tabs.add(tabId);
        console.log('[NFTListener] Registered tab', tabId, '- Total tabs:', this.tabs.size);
    }

    /**
     * Unregister a tab from listening
     * @param {number} tabId - Chrome tab ID
     */
    unregisterTab(tabId) {
        this.tabs.delete(tabId);
        console.log('[NFTListener] Unregistered tab', tabId, '- Total tabs:', this.tabs.size);
    }

    /**
     * Check if any tabs are actively listening
     * @returns {boolean}
     */
    hasActiveTabs() {
        return this.tabs.size > 0;
    }
}

export const nftListener = new NFTListener();
```

**Step 2: Verify file is created and syntax is correct**

Run: `head -20 /Users/pgi/renaiss-bid-bot-extension/src/nft-listener.js`
Expected: File contains the NFTListener class definition

**Step 3: Commit**

```bash
git add src/nft-listener.js
git commit -m "feat: create NFT transfer listener module for blockchain event monitoring"
```

---

## Task 4: Update Service Worker to Handle NFT Listening

**Files:**
- Modify: `src/service-worker.js`

**Step 1: Read current service worker**

Run: `cat /Users/pgi/renaiss-bid-bot-extension/src/service-worker.js`

**Step 2: Add NFT listener import and message handler**

Add at the top of the file (after any existing imports):

```javascript
import { nftListener } from './nft-listener.js';
```

Add this message listener (can be added after any existing listeners):

```javascript
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
```

**Step 3: Verify service worker is updated**

Run: `grep -n "import.*nft-listener" /Users/pgi/renaiss-bid-bot-extension/src/service-worker.js`
Expected: Import line exists

**Step 4: Commit**

```bash
git add src/service-worker.js
git commit -m "feat: add NFT listener message handlers to service worker"
```

---

## Task 5: Create Marketplace NFT Transfer Content Script

**Files:**
- Create: `src/marketplace-nft-listener.js`

**Step 1: Write the marketplace content script**

```javascript
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
        chrome.runtime.sendMessage(
            { action: 'start-nft-listening' },
            (response) => {
                if (response && response.success) {
                    console.log('[MarketplaceNFTListener] NFT listening started:', response.message);
                } else {
                    console.error('[MarketplaceNFTListener] Failed to start listening:', response?.message);
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
```

**Step 2: Verify file is created**

Run: `head -15 /Users/pgi/renaiss-bid-bot-extension/src/marketplace-nft-listener.js`
Expected: File contains the marketplace listener setup

**Step 3: Commit**

```bash
git add src/marketplace-nft-listener.js
git commit -m "feat: create marketplace NFT transfer listener content script"
```

---

## Task 6: Update Manifest to Add Marketplace NFT Listener Script

**Files:**
- Modify: `manifest.json`

**Step 1: Read current manifest**

Run: `cat /Users/pgi/renaiss-bid-bot-extension/manifest.json`

**Step 2: Add marketplace NFT listener content script**

Find the existing content_scripts array and add a new entry for the NFT listener. The manifest should look like this after modification:

```json
{
    "manifest_version": 3,
    "name": "Renaiss Price Helper",
    "version": "1.0",
    "permissions": [
        "activeTab",
        "storage",
        "scripting",
        "tabs"
    ],
    "host_permissions": [
        "https://www.renaiss.xyz/*",
        "http://localhost:8000/*",
        "https://localhost:8000/*",
        "https://*.thisisallyouneed.com/*"
    ],
    "background": {
        "service_worker": "src/service-worker.js"
    },
    "action": {
        "default_popup": "src/popup.html"
    },
    "content_scripts": [
        {
            "matches": [
                "https://www.renaiss.xyz/card/*"
            ],
            "js": [
                "src/config.js",
                "src/utils.js",
                "src/dom.js",
                "src/api.js",
                "src/ui.js",
                "src/automation.js",
                "src/main.js"
            ],
            "css": [
                "src/styles.css"
            ]
        },
        {
            "matches": [
                "https://www.renaiss.xyz/marketplace*"
            ],
            "exclude_matches": [
                "https://www.renaiss.xyz/card/*"
            ],
            "js": [
                "src/price-analyzer.js"
            ],
            "run_at": "document_idle"
        },
        {
            "matches": [
                "https://www.renaiss.xyz/marketplace*"
            ],
            "exclude_matches": [
                "https://www.renaiss.xyz/card/*"
            ],
            "js": [
                "src/marketplace-nft-listener.js"
            ],
            "run_at": "document_idle"
        }
    ]
}
```

**Step 3: Verify manifest is valid JSON**

Run: `npx json-lint /Users/pgi/renaiss-bid-bot-extension/manifest.json`
Expected: No validation errors

**Step 4: Commit**

```bash
git add manifest.json
git commit -m "feat: add marketplace NFT listener content script to manifest"
```

---

## Task 7: Build and Test Extension

**Files:**
- No new files, testing existing setup

**Step 1: Build the extension**

Run: `cd /Users/pgi/renaiss-bid-bot-extension && npm run build`
Expected: Build completes without errors

**Step 2: Check for build output**

Run: `ls -la /Users/pgi/renaiss-bid-bot-extension/dist/` (or wherever build outputs)
Expected: Build artifacts exist

**Step 3: Verify no console errors in manifest**

Run: `node -c /Users/pgi/renaiss-bid-bot-extension/src/ws-config.js && echo "ws-config.js syntax OK"`
Expected: Syntax validation passes

**Step 4: Manual testing checklist**

- Load extension in Chrome (chrome://extensions)
- Navigate to https://www.renaiss.xyz/marketplace
- Open DevTools (F12) → check console for `[MarketplaceNFTListener] Content script loaded`
- Check Service Worker logs in extension details page for initialization messages
- (Optional) Trigger a test transfer event to verify tab opening works

**Step 5: Commit**

```bash
git add .
git commit -m "test: verify NFT listener extension builds and loads without errors"
```

---

## Task 8: Document Configuration Instructions

**Files:**
- Modify: `docs/plans/2026-01-20-nft-transfer-listener.md` (this file)

**Step 1: Add configuration section at end of this document**

Append to this file:

```markdown
## Configuration Instructions

### Adding WebSocket Endpoints

After research, add your BSC WebSocket endpoints to `src/ws-config.js`:

```javascript
export const WS_ENDPOINTS = {
    pools: [
        'wss://your-bsc-endpoint-1:443',
        'wss://your-bsc-endpoint-2:443',
        // Add more endpoints for redundancy
    ],
    fallbackRpc: 'https://bsc-dataseed.binance.org/',
    currentIndex: 0
};
```

Recommended endpoints to research:
- Nariox: `wss://bsc-ws-node.nariox.org:443`
- GetBlock: `wss://bsc.getblock.io/{api-key}` (requires free API key)
- Ankr: `wss://rpc.ankr.com/bsc/ws` (check current status)

### Testing the Feature

1. Start extension in development mode
2. Navigate to https://www.renaiss.xyz/marketplace
3. Monitor browser console and Service Worker logs
4. When an NFT transfer occurs on the contract, a new tab should open with the card details

### Debugging

Enable detailed logging by checking:
- Content script console: `[MarketplaceNFTListener]` messages
- Service Worker console: `[ServiceWorker]` and `[NFTListener]` messages
- Check Network tab in DevTools to verify WebSocket connection
```

**Step 2: Save the documentation update**

Run: `git add docs/plans/2026-01-20-nft-transfer-listener.md`

**Step 3: Final commit**

```bash
git add docs/plans/2026-01-20-nft-transfer-listener.md
git commit -m "docs: add configuration instructions for NFT listener setup"
```

---

## Configuration Instructions

### Adding WebSocket Endpoints

After research, add your BSC WebSocket endpoints to `src/ws-config.js`:

```javascript
export const WS_ENDPOINTS = {
    pools: [
        'wss://your-bsc-endpoint-1:443',
        'wss://your-bsc-endpoint-2:443',
        // Add more endpoints for redundancy
    ],
    fallbackRpc: 'https://bsc-dataseed.binance.org/',
    currentIndex: 0
};
```

Recommended endpoints to research:
- Nariox: `wss://bsc-ws-node.nariox.org:443`
- GetBlock: `wss://bsc.getblock.io/{api-key}` (requires free API key)
- Ankr: `wss://rpc.ankr.com/bsc/ws` (check current status)

### Testing the Feature

1. Start extension in development mode
2. Navigate to https://www.renaiss.xyz/marketplace
3. Monitor browser console and Service Worker logs
4. When an NFT transfer occurs on the contract, a new tab should open with the card details

### Debugging

Enable detailed logging by checking:
- Content script console: `[MarketplaceNFTListener]` messages
- Service Worker console: `[ServiceWorker]` and `[NFTListener]` messages
- Check Network tab in DevTools to verify WebSocket connection

---

## Summary

This plan implements a real-time NFT transfer listener with the following components:

1. **ws-config.js** — WebSocket endpoint pool for blockchain connection
2. **ethers.js** — Added as dependency for blockchain interaction
3. **nft-listener.js** — Core module managing blockchain events
4. **service-worker.js** — Updated to handle listening lifecycle
5. **marketplace-nft-listener.js** — Content script on marketplace page
6. **manifest.json** — Updated to include content script

Total commits: 8 (one per task)
Total new files: 3 (ws-config.js, nft-listener.js, marketplace-nft-listener.js)
Dependencies added: ethers.js v6

The feature is ready for testing after adding WebSocket endpoints to ws-config.js.
