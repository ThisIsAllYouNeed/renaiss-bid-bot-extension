function getOwner() {
    const ownerSpans = [...document.querySelectorAll('span')]
        .filter(span => span.textContent.trim() === 'Owned by');
    const owner = ownerSpans
        .map(span =>
            span
                ?.nextElementSibling           // next sibling div
                ?.querySelector('a')
                ?.textContent
        )
        .filter(Boolean)[0];
    return owner;
}

function getAllOffers() {
    const offerSpans = [...document.querySelectorAll('span')]
        .filter(span => span.textContent.trim() === 'offer');

    const bidders = offerSpans
        .map(span =>
            span
                .closest('div')                // div containing "offer"
                ?.nextElementSibling           // next sibling div
                ?.querySelector('div > div > span:nth-of-type(2)')
                ?.textContent
        )
        .filter(Boolean);                  // remove nulls

    const prices = offerSpans
        .map(span =>
            span
                .closest('div')                // div containing "offer"
                ?.nextElementSibling           // next sibling div
                ?.querySelector('div')
                ?.nextElementSibling
                ?.querySelector('span')
                ?.childNodes[0]
                ?.textContent
        )
        .filter(Boolean);                  // remove nulls

    console.log(bidders);
    console.log(prices);
    return { bidders, prices };
}


// --- Helper: XPath Fetcher with Logging ---
function getElementByXpath(path, description) {
    const element = document.evaluate(path, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;

    if (element) {
        console.log(`%c[FOUND] ${description}:`, 'color: #4ade80; font-weight: bold;', element);
    } else {
        console.warn(`%c[NOT FOUND] ${description}: Check path -> ${path}`, 'color: #f87171; font-weight: bold;');
    }
    return element;
}
