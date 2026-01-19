document.addEventListener('DOMContentLoaded', () => {
    const riskTakerCheckbox = document.getElementById('risk-taker-checkbox');
    const dontCloseCheckbox = document.getElementById('dont-close-checkbox');

    // Load saved settings
    chrome.storage.local.get(['isRiskTaker', 'dontCloseWindow'], (result) => {
        riskTakerCheckbox.checked = result.isRiskTaker; // Default to true
        dontCloseCheckbox.checked = result.dontCloseWindow;
    });

    // Save settings on change
    riskTakerCheckbox.addEventListener('change', (event) => {
        chrome.storage.local.set({ isRiskTaker: event.target.checked });
    });

    dontCloseCheckbox.addEventListener('change', (event) => {
        chrome.storage.local.set({ dontCloseWindow: event.target.checked });
    });

    // Load and display saved address
    const userAddressInput = document.getElementById('userAddress');
    const addressSavedSpan = document.getElementById('addressSaved');

    chrome.storage.local.get(['userAddress'], (result) => {
        if (result.userAddress) {
            userAddressInput.value = result.userAddress;
            addressSavedSpan.classList.add('show');
            addressSavedSpan.textContent = '✓ Saved';
        }
    });

    // Save address whenever user types
    userAddressInput.addEventListener('input', () => {
        const address = userAddressInput.value.trim();
        chrome.storage.local.set({ userAddress: address });

        // Show/hide the saved indicator
        if (address) {
            addressSavedSpan.classList.add('show');
            addressSavedSpan.textContent = '✓ Saved';
        } else {
            addressSavedSpan.classList.remove('show');
            addressSavedSpan.textContent = '';
        }
    });

    document.getElementById('reloadButton').addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0] && tabs[0].id) {
                chrome.tabs.sendMessage(tabs[0].id, { action: 'reload' }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error(chrome.runtime.lastError.message);
                    } else if (response) {
                        console.log('Reload response:', response);
                    }
                });
            }
        });
    });
});
