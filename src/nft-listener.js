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
            console.log('[NFTListener] Checking if provider exists:', !!this.provider);

            if (!this.provider) {
                console.log('[NFTListener] No provider, initializing...');
                const initialized = await this.initializeProvider();
                console.log('[NFTListener] Provider initialization result:', initialized);

                if (!initialized) {
                    throw new Error('Failed to initialize provider');
                }
            } else {
                console.log('[NFTListener] Provider already exists');
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
            this.listener = (from, to, tokenId) => {
                console.log('[NFTListener] Event listener callback triggered!');
                this.onTransferDetected(from, to, tokenId);
            };

            this.contract.on(filter, this.listener);
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
            this.isListening = false;
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
