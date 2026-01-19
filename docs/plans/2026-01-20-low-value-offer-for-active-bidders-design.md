# Low-Value Offer for Active Bidders Design

**Date:** 2026-01-20
**Feature:** Automatically place $1 USD offer when user is currently bidding but targetOffer is below 95% of FMV

## Overview

This feature extends the existing auto-offer logic to handle cases where:
1. User's calculated targetOffer is below 95% of FMV
2. User is currently bidding on the card (their wallet address exists in the bidders list)

In these cases, instead of closing the window without offering, the extension automatically places a $1 USD offer to maintain the user's active bid status.

## Implementation Sections

### 1. Popup UI & Storage

**Location:** `src/popup.html` and `src/popup.js`

**Changes:**
- Add a text input field in `popup.html` with label "Wallet Address"
- Add input event listener in `popup.js` to save the address to `chrome.storage.local` whenever the user modifies it
- Retrieve and display the saved address on popup load
- Add visual feedback (like a checkmark) when address is saved

**Data Flow:**
```
User enters address in popup → popup.js saves to chrome.storage.local → main.js retrieves it
```

### 2. Main.js Logic

**Location:** `src/main.js` in the `init()` function

**Changes:**
1. Update the settings retrieval Promise to include `userAddress`:
   ```javascript
   {
       isRiskTaker: result.isRiskTaker || false,
       dontCloseWindow: result.dontCloseWindow || false,
       userAddress: result.userAddress || ''
   }
   ```

2. Add helper function `isUserCurrentlyBidding(userAddress, bidders)`:
   - Returns `true` if `userAddress` is found in the `bidders` array
   - Returns `false` if userAddress is empty or not in bidders

3. Update the conditional logic that decides whether to auto-offer:
   - **Case 1:** If `targetOffer > 0.95 * fmv` → place `targetOffer` (existing behavior)
   - **Case 2:** If `targetOffer < 0.95 * fmv` AND `isUserCurrentlyBidding()` → place `1.00` USD
   - **Case 3:** If `targetOffer < 0.95 * fmv` AND NOT currently bidding → close window without offering

4. Reuse existing `executeAutoOffer()` function with the determined offer amount

### 3. Error Handling & Edge Cases

**User hasn't set address yet:**
- If `userAddress` is empty/undefined, skip the bidding check
- Proceed with normal logic: place targetOffer if high enough, otherwise close

**Invalid address format:**
- No validation of address format—just string comparison
- User is responsible for entering their correct address

**Empty bidders array:**
- `isUserCurrentlyBidding()` safely returns `false`

**Offer placement failures:**
- Use existing error handling in `executeAutoOffer()`

## Test Scenarios

1. ✓ User address in bidders + low targetOffer → places $1 offer automatically
2. ✓ User address NOT in bidders + low targetOffer → closes window without offering
3. ✓ User hasn't set address + low targetOffer → closes window without offering
4. ✓ High targetOffer (>0.95 * fmv) → places targetOffer (existing behavior unchanged)

## Backwards Compatibility

- Existing behavior is preserved when user hasn't configured their address
- No breaking changes to existing settings or logic
- Popup remains optional—extension works without address configured

