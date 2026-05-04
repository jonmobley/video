function darkenColor(hex, percent) {
    const num = parseInt(hex.slice(1), 16);
    const amt = Math.round(2.55 * percent * 100);
    const R = (num >> 16) - amt;
    const G = ((num >> 8) & 0x00FF) - amt;
    const B = (num & 0x0000FF) - amt;
    return '#' + ((R < 0 ? 0 : R) * 0x10000 + (G < 0 ? 0 : G) * 0x100 + (B < 0 ? 0 : B)).toString(16).padStart(6, '0');
}

function hexToRgba(hex, alpha) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${alpha})` : null;
}

function applyAccentColor(color) {
    if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
        console.error('Invalid color format:', color);
        return;
    }

    const root = document.documentElement;
    root.style.setProperty('--accent-color', color);

    const hoverColor = darkenColor(color, 0.1);
    root.style.setProperty('--accent-hover', hoverColor);

    const lightColor = hexToRgba(color, 0.1);
    root.style.setProperty('--accent-light', lightColor);

    const shadowColor = hexToRgba(color, 0.3);
    root.style.setProperty('--accent-shadow', shadowColor);

    const mediumColor = hexToRgba(color, 0.2);
    root.style.setProperty('--accent-medium', mediumColor);

    const heavyColor = hexToRgba(color, 0.4);
    root.style.setProperty('--accent-heavy', heavyColor);

    document.getElementById('theme-color-meta').content = color;
}
