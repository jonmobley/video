function showError(errorType) {
    const videoGrid = document.getElementById('videoGrid');
    let icon, headline, subtitle;

    if (errorType === 'network') {
        icon = '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 1l22 22"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.56 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>';
        headline = 'No connection';
        subtitle = "Check your internet and try again.";
    } else if (errorType === 'server') {
        icon = '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
        headline = 'Unable to load';
        subtitle = "There was a problem on our end. Please try again in a moment.";
    } else {
        icon = '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
        headline = "Videos unavailable";
        subtitle = 'This is probably temporary. Please try again.';
    }

    videoGrid.innerHTML = `
        <div style="text-align: center; padding: 60px 20px; color: #ccc; grid-column: 1 / -1;">
            <div style="margin-bottom: 16px;" aria-hidden="true">${icon}</div>
            <h3 style="color: #fff; font-size: 20px; font-weight: 600; margin: 0 0 8px 0;">${headline}</h3>
            <p style="color: #aaa; font-size: 15px; margin: 0 0 24px 0; max-width: 400px; margin-left: auto; margin-right: auto;">${subtitle}</p>
            <button data-action="reload-videos" style="padding: 10px 24px; background: var(--accent-color, #008f67); color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 15px; font-weight: 500; transition: opacity 0.2s;">Try Again</button>
        </div>
    `;
}
