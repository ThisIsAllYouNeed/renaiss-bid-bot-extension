// src/nft-listener.js
/**
 * NFT Transfer Listener Module
 * Manages blockchain connection and Transfer event listening
 */

// Import ethers from CDN ES module
import { ethers } from 'https://esm.sh/ethers@6.11.1';
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

        // Status tracking
        this.connectionStatus = 'disconnected'; // 'connected', 'disconnected', 'connecting', 'failed'
        this.activeEndpoint = null;
        this.lastTransferEvent = null;
        this.connectionTimestamp = null;

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

    /**
     * Start listening to Transfer events
     * @returns {Promise<boolean>} Success status
     */
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
                // Reset provider to force reinitialization
                this.provider = null;
                const initialized = await this.initializeProvider();
                console.log('[NFTListener] Provider reinitialization result:', initialized);

                if (!initialized) {
                    throw new Error('Failed to reinitialize provider');
                }
            } else {
                console.log('[NFTListener] Provider is healthy');
            }

            // Create contract instance with event filter
            console.log('[NFTListener] Creating contract instance with address:', CONTRACT_ADDRESS);
            this.contract = new ethers.Contract(
                CONTRACT_ADDRESS,
                TRANSFER_EVENT_ABI,
                this.provider
            );
            console.log('[NFTListener] Contract instance created');

            // Create a filter for all transfers from this contract
            console.log('[NFTListener] Creating transfer filter...');
            const filter = this.contract.filters.Transfer();
            console.log('[NFTListener] Filter created:', filter);

            // Set up the event listener
            console.log('[NFTListener] Setting up event listener...');
            this.listener = (eventLog) => {
                console.log('[NFTListener] Event listener callback triggered!');
                console.log('[NFTListener] EventLog object:', eventLog);
                console.log('[NFTListener] EventLog.args:', eventLog.args);

                // ethers.js v6 passes EventLog object with args as a Proxy containing [from, to, tokenId]
                const from = eventLog.args[0];
                const to = eventLog.args[1];
                const tokenId = eventLog.args[2];

                console.log('[NFTListener] Extracted - From:', from, 'To:', to, 'TokenId:', tokenId);
                this.onTransferDetected(from, to, tokenId);
            };

            // Wrap contract.on() in a try-catch because the connection can drop during setup
            try {
                console.log('[NFTListener] Calling contract.on() to start listening...');
                this.contract.on(filter, this.listener);
                console.log('[NFTListener] contract.on() completed successfully');
            } catch (onError) {
                console.error('[NFTListener] Error during contract.on():', onError.message);
                throw onError;
            }

            // Set up WebSocket disconnection detection (if using WebSocketProvider)
            if (this.provider._websocket) {
                console.log('[NFTListener] Setting up WebSocket event handlers...');
                this.provider._websocket.addEventListener('close', () => {
                    console.warn('[NFTListener] WebSocket closed unexpectedly!');
                    this.isListening = false;
                    if (this.hasActiveTabs()) {
                        console.log('[NFTListener] WebSocket closed but tabs still listening, scheduling reconnect');
                        this.scheduleReconnect();
                    }
                });
                this.provider._websocket.addEventListener('error', (event) => {
                    console.error('[NFTListener] WebSocket error:', event);
                    this.isListening = false;
                    if (this.hasActiveTabs()) {
                        console.log('[NFTListener] WebSocket error occurred, scheduling reconnect');
                        this.scheduleReconnect();
                    }
                });
            }

            this.isListening = true;
            console.log('[NFTListener] isListening set to true');

            console.log('[NFTListener] === Successfully started listening to Transfer events ===');
            console.log('[NFTListener] Contract address:', CONTRACT_ADDRESS);
            console.log('[NFTListener] Provider:', this.provider.constructor.name);
            return true;
        } catch (error) {
            console.error('[NFTListener] === FAILED to start listening ===');
            console.error('[NFTListener] Error message:', error.message);
            console.error('[NFTListener] Full error:', error);
            console.error('[NFTListener] Stack trace:', error.stack);
            this.isListening = false;

            // Reset provider and contract on failure to force clean reconnection
            console.log('[NFTListener] Resetting provider and contract for clean reconnection...');
            this.provider = null;
            this.contract = null;

            // Schedule reconnection if we have active tabs
            if (this.hasActiveTabs()) {
                console.log('[NFTListener] Scheduling reconnection attempt...');
                this.scheduleReconnect();
            }

            return false;
        }
    }

    /**
     * Stop listening to Transfer events
     */
    async stopListening() {
        if (this.contract && this.listener) {
            this.contract.removeListener('Transfer', this.listener);
            this.isListening = false;
            this.connectionStatus = 'disconnected';
            await this.updateStorageStatus();
            console.log('[NFTListener] Stopped listening to Transfer events');
        }

        // Remove WebSocket event listeners to prevent memory leaks
        if (this.provider && this.provider._websocket) {
            try {
                this.provider._websocket.removeEventListener('close');
                this.provider._websocket.removeEventListener('error');
                console.log('[NFTListener] Removed WebSocket event listeners');
            } catch (error) {
                console.log('[NFTListener] Could not remove WebSocket event listeners (may already be removed)');
            }
        }

        // Clear any pending reconnection attempts
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
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
