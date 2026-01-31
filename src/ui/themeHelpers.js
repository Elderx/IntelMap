/**
 * Theme Helpers for Dark/Light Mode
 * Provides theme-aware colors for inline styles in JavaScript components
 */

/**
 * Get theme-appropriate colors for inline styles
 * @returns {Object} Color object with properties for current theme
 */
export function getThemeColor() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  if (isDark) {
    return {
      bg: 'rgba(30, 30, 30, 0.95)',
      bgElevated: 'rgba(45, 45, 45, 0.98)',
      bgLight: 'rgba(255, 255, 255, 0.05)',
      bgLighter: 'rgba(255, 255, 255, 0.08)',
      border: '#555',
      text: '#e0e0e0',
      textMuted: '#b0b0b0',
      textLight: '#909090',
      primary: '#42a5f5',
      danger: '#ef5350',
      success: '#66bb6a',
      warning: '#ffa726',
      hover: 'rgba(255, 255, 255, 0.08)',
      closeBtnHover: 'rgba(255, 255, 255, 0.1)',
      infoLink: '#64b5f6'
    };
  } else {
    return {
      bg: 'rgba(255, 255, 255, 0.95)',
      bgElevated: 'rgba(255, 255, 255, 0.98)',
      bgLight: 'rgba(0, 0, 0, 0.02)',
      bgLighter: 'rgba(0, 0, 0, 0.04)',
      border: '#ccc',
      text: '#333',
      textMuted: '#666',
      textLight: '#888',
      primary: '#1976d2',
      danger: '#e53935',
      success: '#4caf50',
      warning: '#ff9800',
      hover: 'rgba(0, 0, 0, 0.04)',
      closeBtnHover: '#f0f0f0',
      infoLink: '#0077cc'
    };
  }
}

/**
 * Apply theme styles to an element with automatic update on theme change
 * @param {HTMLElement} element - Element to style
 * @param {Function} styleFn - Function that returns styles object, receives getThemeColor
 * @returns {MutationObserver} Observer that can be disconnected if needed
 */
export function applyThemeStyles(element, styleFn) {
  const apply = () => {
    const colors = getThemeColor();
    const styles = styleFn(colors);
    Object.assign(element.style, styles);
  };

  // Apply initial styles
  apply();

  // Listen for theme changes and re-apply
  const observer = new MutationObserver(apply);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme']
  });

  return observer;
}

/**
 * Get the current theme ('light' or 'dark')
 * @returns {string} Current theme
 */
export function getCurrentTheme() {
  return document.documentElement.getAttribute('data-theme') || 'light';
}

/**
 * Check if dark mode is currently active
 * @returns {boolean} True if dark mode is active
 */
export function isDarkMode() {
  return getCurrentTheme() === 'dark';
}
