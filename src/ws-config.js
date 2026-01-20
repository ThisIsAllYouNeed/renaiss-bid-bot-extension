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
