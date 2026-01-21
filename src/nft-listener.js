// src/nft-listener.js
/**
 * NFT Transfer Listener Module
 * Manages blockchain connection and Transfer event listening
 */

// Import ethers from CDN ES module
import { ethers } from 'https://esm.sh/ethers@6.11.1';
import { getNextWsEndpoint, getFallbackRpcEndpoint } from './ws-config.js';

// The marketplace contract we're monitoring for trades
const MARKETPLACE_CONTRACT = '0xae3e7268ef5a062946216a44f58a8f685ffd11d0';
// The NFT contract that emits Transfer events (used as log emitter filter)
// Using lowercase to ensure RPC provider filter matching works correctly
const NFT_CONTRACT_ADDRESS = '0xf8646a3ca093e97bb404c3b25e675c0394dd5b30';
const CHAIN_ID = 56; // BSC Chain ID

// ERC721 Transfer event signature: Transfer(address indexed from, address indexed to, uint256 indexed tokenId)
// Topic0 = keccak256("Transfer(address,address,uint256)")
const TRANSFER_EVENT_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
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

        // Status tracking
        this.connectionStatus = 'disconnected'; // 'connected', 'disconnected', 'connecting', 'failed'
        this.activeEndpoint = null;
        this.lastTransferEvent = null;
        this.connectionTimestamp = null;

        this.pollIntervalHandle = null;
        this.lastProcessedBlock = null;
        this.blockPollIntervalMs = 3000;
        this.processedTxHashesForDeduplication = new Set();

        // Reconnection tracking
        this.reconnectTimeout = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 20;
        this.baseReconnectDelay = 2000; // Start with 2 seconds
    }

    /**
     * Initialize provider with WebSocket or HTTP fallback
     * @returns {Promise<boolean>} Success status
     */
    async initializeProvider() {
        try {
            console.log('[NFTListener] === Starting initializeProvider ===');
            this.connectionStatus = 'connecting';
            console.log('[NFTListener] Set status to: connecting');

            await this.updateStorageStatus();
            console.log('[NFTListener] Updated storage status');

            const wsEndpoint = getNextWsEndpoint();
            console.log('[NFTListener] WebSocket endpoint from config:', wsEndpoint);

            if (wsEndpoint) {
                try {
                    console.log('[NFTListener] Attempting WebSocket connection:', wsEndpoint);
                    this.provider = new ethers.WebSocketProvider(wsEndpoint);
                    console.log('[NFTListener] WebSocketProvider created, testing connection...');

                    const network = await this.provider.getNetwork();
                    console.log('[NFTListener] Network test successful:', network);

                    this.connectionStatus = 'connected';
                    this.activeEndpoint = wsEndpoint;
                    this.connectionTimestamp = new Date().toISOString();
                    console.log('[NFTListener] Status set to connected, endpoint:', wsEndpoint);

                    await this.updateStorageStatus();
                    console.log('[NFTListener] Storage updated with connected status');
                    return true;
                } catch (wsError) {
                    console.warn('[NFTListener] WebSocket failed:', wsError.message);
                    console.log('[NFTListener] Attempting HTTP fallback...');
                }
            } else {
                console.log('[NFTListener] No WebSocket endpoints configured, using HTTP fallback');
            }

            // Fallback to HTTP
            const rpcEndpoint = getFallbackRpcEndpoint();
            console.log('[NFTListener] HTTP fallback endpoint:', rpcEndpoint);
            console.log('[NFTListener] Creating JsonRpcProvider...');

            this.provider = new ethers.JsonRpcProvider(rpcEndpoint);
            console.log('[NFTListener] JsonRpcProvider created, testing connection...');

            const network = await this.provider.getNetwork();
            console.log('[NFTListener] Network test successful:', network);

            this.connectionStatus = 'connected';
            this.activeEndpoint = rpcEndpoint + ' (HTTP Fallback)';
            this.connectionTimestamp = new Date().toISOString();
            console.log('[NFTListener] HTTP connection established:', this.activeEndpoint);

            await this.updateStorageStatus();
            console.log('[NFTListener] Storage updated with HTTP connected status');
            return true;
        } catch (error) {
            console.error('[NFTListener] === FAILED to initialize provider ===');
            console.error('[NFTListener] Error message:', error.message);
            console.error('[NFTListener] Full error object:', error);

            this.connectionStatus = 'failed';
            this.activeEndpoint = null;

            await this.updateStorageStatus();
            console.log('[NFTListener] Storage updated with failed status');
            return false;
        }
    }

    /**
     * Check if the provider connection is healthy
     * @returns {Promise<boolean>} True if provider is connected and responsive
     */
    async isProviderHealthy() {
        try {
            if (!this.provider) {
                console.log('[NFTListener] Provider is null');
                return false;
            }

            // For WebSocketProvider, check if connection is open
            if (this.provider._websocket) {
                const wsReadyState = this.provider._websocket.readyState;
                console.log('[NFTListener] WebSocket readyState:', wsReadyState);
                // 0 = CONNECTING, 1 = OPEN, 2 = CLOSING, 3 = CLOSED
                if (wsReadyState !== 1) {
                    console.log('[NFTListener] WebSocket is not in OPEN state');
                    return false;
                }
            }

            // Try a simple network call to verify provider is responsive
            console.log('[NFTListener] Testing provider connectivity...');
            const network = await this.provider.getNetwork();
            console.log('[NFTListener] Provider is healthy, chain:', network.chainId);
            return true;
        } catch (error) {
            console.error('[NFTListener] Provider health check failed:', error.message);
            return false;
        }
    }

    async startListening() {
        console.log('[NFTListener] startListening() called');

        if (this.isListening) {
            console.log('[NFTListener] Already listening, returning true');
            return true;
        }

        try {
            console.log('[NFTListener] Checking provider health...');
            const providerHealthy = await this.isProviderHealthy();

            if (!providerHealthy) {
                console.log('[NFTListener] Provider is not healthy, reinitializing...');
                await this.destroyProvider();
                const initialized = await this.initializeProvider();
                console.log('[NFTListener] Provider reinitialization result:', initialized);

                if (!initialized) {
                    throw new Error('Failed to reinitialize provider');
                }
            } else {
                console.log('[NFTListener] Provider is healthy');
            }

            console.log('[NFTListener] Creating contract instance for NFT:', NFT_CONTRACT_ADDRESS);
            this.contract = new ethers.Contract(
                NFT_CONTRACT_ADDRESS,
                TRANSFER_EVENT_ABI,
                this.provider
            );
            console.log('[NFTListener] Contract instance created');

            const currentBlock = await this.provider.getBlockNumber();
            this.lastProcessedBlock = currentBlock;
            console.log('[NFTListener] Starting from block:', currentBlock);

            this.startPolling();

            this.isListening = true;
            console.log('[NFTListener] isListening set to true');

            console.log('[NFTListener] === Successfully started polling for Transfer events ===');
            console.log('[NFTListener] NFT contract:', NFT_CONTRACT_ADDRESS);
            console.log('[NFTListener] Poll interval:', this.blockPollIntervalMs, 'ms');
            console.log('[NFTListener] Provider:', this.provider.constructor.name);
            return true;
        } catch (error) {
            console.error('[NFTListener] === FAILED to start listening ===');
            console.error('[NFTListener] Error message:', error.message);
            console.error('[NFTListener] Full error:', error);
            this.isListening = false;

            console.log('[NFTListener] Destroying provider for clean reconnection...');
            await this.destroyProvider();

            if (this.hasActiveTabs()) {
                console.log('[NFTListener] Scheduling reconnection attempt...');
                this.scheduleReconnect();
            }

            return false;
        }
    }

    startPolling() {
        if (this.pollIntervalHandle) {
            clearInterval(this.pollIntervalHandle);
        }

        console.log('[NFTListener] Starting block polling...');
        this.pollIntervalHandle = setInterval(() => this.pollForTransfers(), this.blockPollIntervalMs);
        this.pollForTransfers();
    }

    async pollForTransfers() {
        if (!this.provider || !this.contract) {
            console.log('[NFTListener] Poll skipped - provider or contract not ready');
            return;
        }

        try {
            const currentBlock = await this.provider.getBlockNumber();
            
            if (currentBlock <= this.lastProcessedBlock) {
                return;
            }

            const fromBlock = this.lastProcessedBlock + 1;
            const toBlock = currentBlock;

            console.log('[NFTListener] Polling blocks', fromBlock, 'to', toBlock);

            const filter = this.contract.filters.Transfer();
            const events = await this.contract.queryFilter(filter, fromBlock, toBlock);

            if (events.length > 0) {
                console.log('[NFTListener] Found', events.length, 'Transfer event(s)');
            }

            for (const event of events) {
                const txHash = event.transactionHash;
                const logIndex = event.index;
                const eventKey = `${txHash}-${logIndex}`;

                if (this.processedTxHashesForDeduplication.has(eventKey)) {
                    continue;
                }
                this.processedTxHashesForDeduplication.add(eventKey);

                if (this.processedTxHashesForDeduplication.size > 1000) {
                    const keysArray = Array.from(this.processedTxHashesForDeduplication);
                    this.processedTxHashesForDeduplication = new Set(keysArray.slice(-500));
                }

                const from = event.args[0];
                const to = event.args[1];
                const tokenId = event.args[2];

                console.log('[NFTListener] *** TRANSFER EVENT DETECTED ***');
                console.log('[NFTListener] Block:', event.blockNumber);
                console.log('[NFTListener] TxHash:', txHash);
                console.log('[NFTListener] From:', from);
                console.log('[NFTListener] To:', to);
                console.log('[NFTListener] TokenId:', tokenId.toString());

                await this.onTransferDetected(from, to, tokenId);
            }

            this.lastProcessedBlock = currentBlock;
        } catch (error) {
            console.error('[NFTListener] Poll error:', error.message);
            
            if (error.message.includes('network') || error.message.includes('connection')) {
                console.log('[NFTListener] Network error detected, scheduling reconnect...');
                this.isListening = false;
                this.stopPolling();
                if (this.hasActiveTabs()) {
                    this.scheduleReconnect();
                }
            }
        }
    }

    stopPolling() {
        if (this.pollIntervalHandle) {
            clearInterval(this.pollIntervalHandle);
            this.pollIntervalHandle = null;
            console.log('[NFTListener] Polling stopped');
        }
    }

    async stopListening() {
        this.stopPolling();
        this.isListening = false;
        this.connectionStatus = 'disconnected';
        await this.updateStorageStatus();
        console.log('[NFTListener] Stopped listening to Transfer events');

        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }

        await this.destroyProvider();
    }

    /**
     * Destroy the provider and wait for WebSocket to fully close
     * @returns {Promise<void>}
     */
    async destroyProvider() {
        if (!this.provider) {
            return;
        }

        console.log('[NFTListener] Destroying provider...');

        // For WebSocketProvider, we need to destroy it and wait for close
        if (this.provider._websocket) {
            const ws = this.provider._websocket;
            const readyState = ws.readyState;
            console.log('[NFTListener] WebSocket readyState before destroy:', readyState);

            // If already closed, no need to wait
            if (readyState === 3) { // CLOSED
                console.log('[NFTListener] WebSocket already closed');
                this.provider = null;
                this.contract = null;
                return;
            }

            // Create a promise that resolves when WebSocket closes
            const closePromise = new Promise((resolve) => {
                const timeout = setTimeout(() => {
                    console.log('[NFTListener] WebSocket close timeout, proceeding anyway');
                    resolve();
                }, 3000); // 3 second timeout

                const onClose = () => {
                    clearTimeout(timeout);
                    console.log('[NFTListener] WebSocket closed successfully');
                    resolve();
                };

                // If already closing or open, wait for close event
                if (readyState === 1 || readyState === 2) { // OPEN or CLOSING
                    ws.addEventListener('close', onClose, { once: true });
                } else {
                    resolve();
                }
            });

            // Call destroy on the provider (ethers.js v6)
            try {
                if (typeof this.provider.destroy === 'function') {
                    console.log('[NFTListener] Calling provider.destroy()');
                    await this.provider.destroy();
                } else if (readyState === 1) { // OPEN - manually close
                    console.log('[NFTListener] Manually closing WebSocket');
                    ws.close();
                }
            } catch (error) {
                console.log('[NFTListener] Error during provider destroy:', error.message);
            }

            // Wait for the WebSocket to fully close
            await closePromise;
        }

        this.provider = null;
        this.contract = null;
        console.log('[NFTListener] Provider destroyed');
    }

    /**
     * Attempt to reconnect after a delay
     * @private
     */
    async scheduleReconnect() {
        if (!this.hasActiveTabs()) {
            console.log('[NFTListener] No active tabs, skipping reconnect');
            return;
        }

        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('[NFTListener] Max reconnect attempts reached, giving up');
            this.connectionStatus = 'failed';
            await this.updateStorageStatus();
            return;
        }

        this.reconnectAttempts++;
        // Exponential backoff: 2s, 4s, 8s, 16s, etc. capped at 60s
        const delay = Math.min(this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 60000);
        console.log(`[NFTListener] Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);

        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
        }

        this.reconnectTimeout = setTimeout(() => {
            console.log('[NFTListener] Executing reconnect attempt...');
            this.startListening().then((success) => {
                if (success) {
                    console.log('[NFTListener] Reconnection successful!');
                    this.reconnectAttempts = 0; // Reset on success
                } else {
                    console.log('[NFTListener] Reconnection failed, will retry');
                    this.scheduleReconnect();
                }
            }).catch((error) => {
                console.error('[NFTListener] Reconnection error:', error);
                this.scheduleReconnect();
            });
        }, delay);
    }

    /**
     * Update chrome.storage with current status
     */
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

    /**
     * Handle detected Transfer event
     * @param {string} from - Sender address
     * @param {string} to - Recipient address
     * @param {BigNumberish} tokenId - Token ID
     */
    async onTransferDetected(from, to, tokenId) {
        try {
            // Validate parameters
            if (tokenId === undefined || tokenId === null) {
                console.error('[NFTListener] Invalid transfer event: tokenId is undefined or null');
                console.error('[NFTListener] Received parameters - from:', from, 'to:', to, 'tokenId:', tokenId);
                return;
            }

            const tokenIdStr = tokenId.toString();
            console.log('[NFTListener] Transfer detected - TokenID:', tokenIdStr, 'From:', from, 'To:', to);

            // Track the last transfer event
            this.lastTransferEvent = {
                tokenId: tokenIdStr,
                from: from,
                to: to,
                timestamp: new Date().toISOString(),
                url: `https://www.renaiss.xyz/card/${tokenIdStr}`
            };

            await this.updateStorageStatus();

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
        } catch (error) {
            console.error('[NFTListener] Error in onTransferDetected:', error.message);
            console.error('[NFTListener] Full error:', error);
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
