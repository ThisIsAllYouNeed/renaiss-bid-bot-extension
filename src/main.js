/**
 * Check if the user's address is currently bidding
 * @param {string} userAddress - User's wallet address
 * @param {string[]} bidders - Array of bidder addresses
 * @returns {boolean} - True if userAddress is in bidders array
 */
function isUserCurrentlyBidding(userAddress, bidders) {
    if (!userAddress || userAddress.trim() === '') {
        return false;
    }
    return bidders.includes(userAddress);
}

async function init() {
    console.log("%c--- Renaiss Helper: Script Starting ---", "color: #3b82f6; font-size: 14px;");

    // Load settings from storage
    const settings = await new Promise(resolve => {
        chrome.storage.local.get(['isRiskTaker', 'dontCloseWindow'], (result) => {
            resolve({
                isRiskTaker: result.isRiskTaker || false,
                dontCloseWindow: result.dontCloseWindow || false
            });
        });
    });

    // 1. Scrape Data
    const owner = getOwner();
    const { bidders, prices } = getAllOffers();

    const paths = {
        list: "//span[contains(text(), 'Current Price')]/following-sibling::span",
        fmv: "//span[contains(text(), 'FMV')]/following-sibling::span",
        offerBtn: "//button[contains(., 'Make offer')]",
        confirmOfferBtn: "//button[contains(., 'confirm offer')]",
        priceInput: "//input[@placeholder='0.00']"
    };

    const listEl = getElementByXpath(paths.list, "list Price Element");
    const list = listEl ? safeParse(listEl.innerText.replace(/[^0-9.]/g, '')) : 0;
    const fmvEl = getElementByXpath(paths.fmv, "FMV Price Element");
    const fmv = fmvEl ? safeParse(fmvEl.innerText.replace(/[^0-9.]/g, '')) : 0;
    const tokenId = window.location.pathname.split("/").pop();

    // 2. API Calls
    const targetOffer = await getCalculatedOffer(tokenId, fmv, list, owner, bidders, prices, settings.isRiskTaker);
    await sendOffersToAPI(tokenId, bidders, prices, fmv);
    console.log("%c[DATA] Scraped Prices:", "color: #fbbf24", { fmv, targetOffer });

    // 3. UI and Automation
    const autoOfferBtn = createHelperUI(fmv, list, targetOffer);

    let offerComplete = new Promise((resolve) => {
        autoOfferBtn.addEventListener('click', async () => {
            await executeAutoOffer(targetOffer, paths);
            resolve();
        });
    });

    if (targetOffer > 0.95 * fmv) {
        await sleep(200);
        autoOfferBtn.click();
        await offerComplete;
        await sleep(10000);
        if (!settings.dontCloseWindow) {
            window.close();
        }
    } else {
        await sleep(500);
        if (!settings.dontCloseWindow) {
            window.close();
        }
    }
}

// Listen for reload messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'reload') {
        console.log('Card page: Re-scan requested from popup');
        init();
        sendResponse({ status: 'reloading' });
    }
    return true; // Indicates asynchronous response
});

// Initial delay to allow page to render
setTimeout(init, 3000);
