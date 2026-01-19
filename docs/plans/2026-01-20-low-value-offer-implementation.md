# Low-Value Offer for Active Bidders Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Automatically place $1 USD offers when user is currently bidding but targetOffer is below 95% of FMV.

**Architecture:** We extend the existing auto-offer logic by (1) capturing user's wallet address in the popup UI, (2) storing it in Chrome storage, (3) checking if the address exists in the bidders list, and (4) automatically placing $1 offers when appropriate. No database changes, no new external dependencies.

**Tech Stack:** Chrome Extension Manifest V3, vanilla JavaScript, Chrome Storage API

---

## Task 1: Update Popup HTML to Add Address Input

**Files:**
- Modify: `src/popup.html`

**Step 1: Read the current popup.html**

Run: `cat src/popup.html`

Expected: See HTML structure with existing settings like isRiskTaker and dontCloseWindow

**Step 2: Add address input field**

After the existing settings checkboxes, add this HTML (before closing `</body>`):

```html
        <div class="setting">
            <label for="userAddress">Wallet Address:</label>
            <input type="text" id="userAddress" placeholder="Enter your wallet address" />
            <span id="addressSaved" style="display: none; color: #10b981; margin-left: 8px;">✓ Saved</span>
        </div>
```

**Step 3: Verify the change**

Run: `grep -n "userAddress" src/popup.html`

Expected: Find the new input field in the output

---

## Task 2: Update Popup CSS for Address Input

**Files:**
- Modify: `src/popup.css`

**Step 1: Add styling for the address input**

Add this CSS rule to the end of `src/popup.css`:

```css
#userAddress {
    width: 100%;
    padding: 8px;
    margin: 5px 0;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 14px;
}

#addressSaved {
    font-size: 12px;
}
```

**Step 2: Verify CSS is added**

Run: `grep -n "userAddress" src/popup.css`

Expected: Find the CSS rules in the output

---

## Task 3: Update Popup JavaScript to Save and Load Address

**Files:**
- Modify: `src/popup.js`

**Step 1: Read current popup.js**

Run: `cat src/popup.js`

Expected: See existing DOMContentLoaded listener and storage interactions

**Step 2: Add address input handling to the DOMContentLoaded listener**

Find the DOMContentLoaded event listener. Inside it, after the existing settings load, add:

```javascript
    // Load and display saved address
    const userAddressInput = document.getElementById('userAddress');
    const addressSavedSpan = document.getElementById('addressSaved');

    chrome.storage.local.get(['userAddress'], (result) => {
        if (result.userAddress) {
            userAddressInput.value = result.userAddress;
            addressSavedSpan.style.display = 'inline';
        }
    });

    // Save address whenever user types
    userAddressInput.addEventListener('input', () => {
        const address = userAddressInput.value.trim();
        chrome.storage.local.set({ userAddress: address });

        // Show/hide the saved indicator
        if (address) {
            addressSavedSpan.style.display = 'inline';
        } else {
            addressSavedSpan.style.display = 'none';
        }
    });
```

**Step 3: Verify the changes look correct**

Run: `cat src/popup.js`

Expected: See the new address handling code in the file

---

## Task 4: Add Helper Function in main.js

**Files:**
- Modify: `src/main.js`

**Step 1: Read current main.js**

Run: `cat src/main.js`

Expected: See the init() function and existing helper patterns

**Step 2: Add the helper function before the init() function**

Add this function at the top of the file (before `async function init()`):

```javascript
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
```

**Step 3: Verify the function is added**

Run: `grep -A 5 "isUserCurrentlyBidding" src/main.js`

Expected: See the helper function definition

---

## Task 5: Update Settings Storage Retrieval in main.js

**Files:**
- Modify: `src/main.js:5-12` (the settings Promise)

**Step 1: Find the settings retrieval code**

Run: `sed -n '5,12p' src/main.js`

Expected: See the Promise that loads isRiskTaker and dontCloseWindow

**Step 2: Update the Promise to include userAddress**

Replace the settings object resolution with:

```javascript
    // Load settings from storage
    const settings = await new Promise(resolve => {
        chrome.storage.local.get(['isRiskTaker', 'dontCloseWindow', 'userAddress'], (result) => {
            resolve({
                isRiskTaker: result.isRiskTaker || false,
                dontCloseWindow: result.dontCloseWindow || false,
                userAddress: result.userAddress || ''
            });
        });
    });
```

**Step 3: Verify the change**

Run: `sed -n '5,13p' src/main.js`

Expected: See userAddress added to the storage.get() call and resolve object

---

## Task 6: Update Offer Logic in main.js

**Files:**
- Modify: `src/main.js:47-60` (the conditional offer logic)

**Step 1: Understand current logic**

Run: `sed -n '47,60p' src/main.js`

Expected: See the if/else that decides whether to auto-offer based on targetOffer > 0.95 * fmv

**Step 2: Replace the conditional logic**

Replace the entire if/else block (lines 47-60) with:

```javascript
    // Determine which offer to place
    let offerToPlace = null;

    if (targetOffer > 0.95 * fmv) {
        // High enough offer - use calculated targetOffer
        offerToPlace = targetOffer;
    } else if (isUserCurrentlyBidding(settings.userAddress, bidders)) {
        // User is currently bidding but targetOffer is low - place $1 to maintain bid
        offerToPlace = 1.00;
    }
    // If neither condition is met, offerToPlace remains null (no offer)

    if (offerToPlace !== null) {
        const autoOfferBtn = createHelperUI(fmv, list, offerToPlace);

        let offerComplete = new Promise((resolve) => {
            autoOfferBtn.addEventListener('click', async () => {
                await executeAutoOffer(offerToPlace, paths);
                resolve();
            });
        });

        await sleep(200);
        autoOfferBtn.click();
        await offerComplete;
        await sleep(10000);
    }

    if (!settings.dontCloseWindow) {
        window.close();
    }
```

**Step 3: Verify the new logic**

Run: `sed -n '47,80p' src/main.js`

Expected: See the new conditional logic with isUserCurrentlyBidding check and three cases

**Step 4: Verify the console logs still work**

Run: `grep -n "DATA" src/main.js`

Expected: Find the console.log for scraped prices (should still be at line 35)

---

## Task 7: Verify No Syntax Errors

**Files:**
- Check: `src/main.js`, `src/popup.js`, `src/popup.html`

**Step 1: Check for JavaScript syntax errors in main.js**

Run: `node -c src/main.js`

Expected: No output (clean syntax)

**Step 2: Check for JavaScript syntax errors in popup.js**

Run: `node -c src/popup.js`

Expected: No output (clean syntax)

**Step 3: Verify all modifications are in place**

Run: `grep -c "isUserCurrentlyBidding" src/main.js && grep -c "userAddress" src/popup.js && grep -c "userAddress" src/popup.html`

Expected: Three lines printed: 2, 2, 1 (showing function is defined and used, and input field exists)

---

## Task 8: Review Changes and Commit

**Files:**
- Modified: `src/main.js`, `src/popup.js`, `src/popup.html`, `src/popup.css`

**Step 1: View all changes**

Run: `git diff src/`

Expected: See the address input in HTML, CSS styling, popup.js event listeners, helper function, and updated logic in main.js

**Step 2: Stage all changes**

Run: `git add src/main.js src/popup.js src/popup.html src/popup.css`

**Step 3: Commit with descriptive message**

Run: `git commit -m "feat: add low-value offer for active bidders"`

**Step 4: Verify commit**

Run: `git log -1 --name-only`

Expected: See commit message and list of 4 modified files

---

## Testing Notes

After implementation, manually test these scenarios:

1. **User enters address in popup** → Should see checkmark appear → Address persists on reload
2. **Low targetOffer + user in bidders** → Should see $1 offer placed automatically
3. **Low targetOffer + user NOT in bidders** → Should close window without offering
4. **User hasn't set address + low targetOffer** → Should close window without offering
5. **High targetOffer (>0.95 * fmv)** → Should place calculated targetOffer (unchanged behavior)

---

## Summary

This implementation:
- Adds wallet address input to the popup UI with visual feedback
- Stores address in Chrome's local storage
- Updates main.js to check if user is bidding before deciding to place $1 offers
- Preserves existing behavior for high-value offers
- Safely handles missing address (treats as "not bidding")

