async function getCalculatedOffer(tokenId, fmv, list, owner, bidders, prices, riskTaker) {
    const bidderList = bidders.length > 0 ? bidders.join(',') : '';
    // Sanitize prices to remove thousands separators before joining
    const sanitizedPrices = prices.map(p => p.replace(/,/g, ''));
    const priceList = sanitizedPrices.length > 0 ? sanitizedPrices.join(',') : '';

    try {
        const offerResponse = await fetch(
            `${API_BASE_URL}/calculate_offer?` +
            `token_id=${encodeURIComponent(tokenId)}&` +
            `fmv=${fmv}&` +
            `list=${list}&` +
            `owner=${encodeURIComponent(owner)}&` +
            `bidders=${encodeURIComponent(bidderList)}&` +
            `prices=${encodeURIComponent(priceList)}&` +
            `risk_taker=${riskTaker}`
        );

        if (!offerResponse.ok) {
            console.error('[ERROR] Failed to calculate offer:', offerResponse.statusText);
            return 0;
        }

        const offerData = await offerResponse.json();
        console.log('[INFO] Calculated offer from server:', offerData.calculated_price);
        return offerData.calculated_price;
    } catch (error) {
        console.error('[ERROR] Failed to fetch calculated offer:', error);
        return 0;
    }
}

async function sendOffersToAPI(tokenId, bidders, prices, fmv) {
    if (!bidders || bidders.length === 0) {
        console.log("[INFO] No offers to send");
        return;
    }

    // Validate array alignment
    if (bidders.length !== prices.length) {
        console.warn(`[WARN] Bidder/price mismatch: ${bidders.length} bidders, ${prices.length} prices`);
    }

    // Pair bidders with prices
    const offersData = bidders.map((bidder, index) => ({
        bidder: bidder,
        price: safeParse(prices[index]),
        fmv: fmv
    }));

    try {
        const response = await fetch(`${API_BASE_URL}/save_offers?token_id=${encodeURIComponent(tokenId)}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(offersData)
        });

        if (!response.ok) {
            throw new Error(`[ERROR] API returned ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();
        console.log("[API] Offers saved successfully:", result);
        return result;
    } catch (error) {
        console.error("[API] Failed to send offers:", error);
    }
}
