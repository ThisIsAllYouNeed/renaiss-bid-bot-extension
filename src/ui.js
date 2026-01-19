function createHelperUI(fmv, list, targetOffer) {
    const overlay = document.createElement('div');
    overlay.id = 'helper-overlay';
    overlay.innerHTML = `
        <div style="display:flex; gap:20px; align-items:center; padding:10px; background:#000000; border-radius:4px;">
            <span><b>FMV:</b> $${fmv.toFixed(2)}</span>
            <span><b>listing:</b> $${list.toFixed(2)}</span>
            <span style="color:${targetOffer > 0.95 * fmv ? '#4ade80' : '#ef4444'}"><b>Target Offer: $${targetOffer.toFixed(2)}</b></span>
            <button id="auto-offer-btn" class="helper-btn">Execute Auto-Offer</button>
        </div>
    `;
    document.body.prepend(overlay);

    return document.getElementById('auto-offer-btn');
}

function showCompletion() {
    const redCircle = document.createElement('div');
    redCircle.style.cssText = `
        width: 20px;
        height: 20px;
        background-color: red;
        border-radius: 50%;
        margin-left: 10px;
    `;
    const overlayDiv = document.getElementById('helper-overlay')?.querySelector('div');
    if (overlayDiv) {
        overlayDiv.appendChild(redCircle);
    }
}
