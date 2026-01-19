const sleep = (ms) => new Promise(res => setTimeout(res, ms));

// Safe number parsing utility
function safeParse(value) {
    const parsed = parseFloat(value);
    if (isNaN(parsed)) {
        console.warn(`[WARN] Invalid number value: ${value}, defaulting to 0`);
        return 0;
    }
    return parsed;
}

function waitForXPath(xpath, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const interval = setInterval(() => {
            const result = document.evaluate(
                xpath,
                document,
                null,
                XPathResult.FIRST_ORDERED_NODE_TYPE,
                null
            ).singleNodeValue;

            if (result) {
                clearInterval(interval);
                resolve(result);
            }

            if (Date.now() - start > timeout) {
                clearInterval(interval);
                reject("XPath timeout");
            }
        }, 100);
    });
}

function setInputValue(input, value) {
    if (!(input instanceof HTMLInputElement)) {
        throw new Error("Provided element is not an input");
    }

    const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
    ).set;
    console.log("Set to", value);

    nativeSetter.call(input, value);

    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
}

function waitForElement(predicate, timeout = 3000) {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const interval = setInterval(() => {
            const el = predicate();
            if (el) {
                clearInterval(interval);
                resolve(el);
            } else if (Date.now() - start > timeout) {
                clearInterval(interval);
                reject(new Error("waitForElement timed out"));
            }
        }, 50);
    });
}
