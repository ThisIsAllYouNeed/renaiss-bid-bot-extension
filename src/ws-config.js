// src/ws-config.js
/**
 * WebSocket endpoints for BSC blockchain connection
 * Endpoints should be added during research phase
 */
export const WS_ENDPOINTS = {
    pools: [
        "wss://bsc-rpc.publicnode.com",
        "wss://bsc.drpc.org",
        "wss://bsc.callstaticrpc.com",
        // Add WebSocket endpoints here
        // Example: 'wss://bsc-ws-node.nariox.org:443'
    ],
    currentIndex: 0
};

/**
 * HTTP RPC endpoint pool for fallback and polling
 */
export const RPC_POOL = {
    endpoints: [
        "https://bsc-mainnet.public.blastapi.io",
        "https://binance.llamarpc.com",
        "https://bsc.rpc.blxrbdn.com",
        "https://api.zan.top/bsc-mainnet",
        "https://bsc-dataseed.binance.org/"
    ],
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
 * Get the next HTTP RPC endpoint in round-robin fashion
 * @returns {string} HTTP RPC endpoint URL
 */
export function getNextRpcEndpoint() {
    const endpoint = RPC_POOL.endpoints[RPC_POOL.currentIndex];
    RPC_POOL.currentIndex = (RPC_POOL.currentIndex + 1) % RPC_POOL.endpoints.length;
    return endpoint;
}

/**
 * Get the HTTP fallback RPC endpoint (uses pool)
 * @returns {string} HTTP RPC endpoint URL
 */
export function getFallbackRpcEndpoint() {
    return getNextRpcEndpoint();
}
