function showError(errorType) {
    const videoGrid = document.getElementById('videoGrid');
    let icon, headline, subtitle;

    if (errorType === 'network') {
        icon = '📡';
        headline = 'Connection trouble';
        subtitle = "Looks like you're offline or the connection dropped. Check your internet and try again.";
    } else if (errorType === 'server') {
        icon = '🔧';
        headline = 'Something went wrong';
        subtitle = "We're having a little trouble on our end. Please try again in a moment.";
    } else {
        icon = '🎬';
        headline = "Videos aren't loading right now";
        subtitle = 'This is probably temporary — give it another shot.';
    }

    videoGrid.innerHTML = `
        <div style="text-align: center; padding: 60px 20px; color: #ccc; grid-column: 1 / -1;">
            <div style="font-size: 48px; margin-bottom: 16px;" aria-hidden="true">${icon}</div>
            <h3 style="color: #fff; font-size: 20px; font-weight: 600; margin: 0 0 8px 0;">${headline}</h3>
            <p style="color: #aaa; font-size: 15px; margin: 0 0 24px 0; max-width: 400px; margin-left: auto; margin-right: auto;">${subtitle}</p>
            <button data-action="reload-videos" style="padding: 10px 24px; background: var(--accent-color, #008f67); color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 15px; font-weight: 500; transition: opacity 0.2s;">Try Again</button>
        </div>
    `;
}
