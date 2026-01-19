async function executeAutoOffer(targetOffer, paths) {
    console.log("%c[ACTION] Auto-Offer Triggered", "color: #3b82f6; font-weight: bold;");

    const btn = getElementByXpath(paths.offerBtn, "Make Offer Button");
    if (btn) {
        btn.click();
        console.log("Step 1: Clicked 'Make Offer'");
        let input;
        try {
            input = await waitForXPath("//input[@placeholder='0.00']");
            console.log("Found:", input);
        } catch (error) {
            console.error(error);
            return;
        }

        if (input) {
            setInputValue(input, targetOffer);
            console.log(`Step 2: Filled Price -> ${targetOffer}`);
            
            // Click on 6 months
            const dropdownButton = [...document.querySelectorAll('span')]
                .find(el => el.textContent.trim() === '6 months');

            dropdownButton?.click();

            // Select 1 day
            try {
                const option = await waitForElement(() =>
                    [...document.querySelectorAll('span, div, li')]
                        .find(el => el.textContent.trim() === '1 day')
                );
                option.scrollIntoView({ block: 'center' });
                option.click();
                console.log("Step 3: Selected '1 day' option");
            } catch (error) {
                console.error('Error selecting 1 day option:', error);
            }

            // Click on Confirm Offer - wait for it to be clickable
            try {
                let confirmBtn = await waitForXPath(paths.confirmOfferBtn, 5000);

                // Retry until button is enabled
                let retries = 0;
                const maxRetries = 10;
                while (confirmBtn.disabled && retries < maxRetries) {
                    retries++;
                    console.log(`Confirm Offer button is disabled, retrying... (${retries}/${maxRetries})`);
                    await sleep(500);
                    confirmBtn = document.evaluate(
                        paths.confirmOfferBtn,
                        document,
                        null,
                        XPathResult.FIRST_ORDERED_NODE_TYPE,
                        null
                    ).singleNodeValue;
                }

                if (confirmBtn && !confirmBtn.disabled) {
                    confirmBtn.click();
                    console.log("Step 4: Clicked 'Confirm Offer'");
                    showCompletion();
                } else {
                    console.error("Confirm Offer button is still disabled after retries");
                }
            } catch (error) {
                console.error("Timeout waiting for Confirm Offer button:", error);
            }
        }
    }
}
