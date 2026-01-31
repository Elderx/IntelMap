/**
 * IntelMap Mobile Menu
 * Slide-out drawer for screens < 768px
 */

import { closeAllDropdowns } from './header.js';

let drawerElement = null;
let overlayElement = null;
let isOpen = false;

/**
 * Initialize the mobile menu
 */
export function initMobileMenu() {
  // Only initialize on mobile screens
  if (window.innerWidth >= 768) {
    // Add resize listener to show/hide hamburger
    window.addEventListener('resize', handleResize);
    return;
  }

  createMobileDrawer();
  handleResize();
}

/**
 * Handle window resize
 */
function handleResize() {
  const isMobile = window.innerWidth < 768;
  const hamburger = document.getElementById('mobile-menu-toggle');

  if (!hamburger) {
    // Create hamburger if it doesn't exist
    if (isMobile) {
      createHamburgerButton();
    }
    return;
  }

  if (isMobile) {
    hamburger.style.display = 'flex';
  } else {
    hamburger.style.display = 'none';
    closeMobileMenu();
  }
}

/**
 * Create the hamburger button
 */
function createHamburgerButton() {
  const header = document.querySelector('.header-section-right');
  if (!header) return;

  // Check if already exists
  if (document.getElementById('mobile-menu-toggle')) return;

  const hamburger = document.createElement('button');
  hamburger.id = 'mobile-menu-toggle';
  hamburger.className = 'header-btn header-btn-icon header-btn-secondary';
  hamburger.innerHTML = `
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M3 12h18M3 6h18M3 18h18"/>
    </svg>
  `;
  hamburger.title = 'Menu';

  // Insert at the beginning of the right section
  header.insertBefore(hamburger, header.firstChild);

  hamburger.addEventListener('click', toggleMobileMenu);
}

/**
 * Create the mobile drawer
 */
function createMobileDrawer() {
  // Drawer
  const drawer = document.createElement('div');
  drawer.id = 'mobile-menu-drawer';
  drawer.className = 'mobile-menu-drawer';
  drawer.innerHTML = `
    <div class="mobile-menu-header">
      <div class="mobile-menu-title">Menu</div>
      <button class="mobile-menu-close" id="mobile-menu-close">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>
    <div class="mobile-menu-content" id="mobile-menu-content"></div>
  `;

  // Overlay
  const overlay = document.createElement('div');
  overlay.id = 'mobile-menu-overlay';
  overlay.className = 'mobile-menu-overlay';

  document.body.appendChild(drawer);
  document.body.appendChild(overlay);

  drawerElement = drawer;
  overlayElement = overlay;

  // Event listeners
  document.getElementById('mobile-menu-close').addEventListener('click', closeMobileMenu);
  overlay.addEventListener('click', closeMobileMenu);
}

/**
 * Toggle the mobile menu
 */
function toggleMobileMenu() {
  if (isOpen) {
    closeMobileMenu();
  } else {
    openMobileMenu();
  }
}

/**
 * Open the mobile menu
 */
function openMobileMenu() {
  if (!drawerElement || !overlayElement) {
    createMobileDrawer();
  }

  // Populate menu content
  populateMobileMenu();

  drawerElement.classList.add('open');
  overlayElement.classList.add('visible');
  isOpen = true;

  // Close any header dropdowns
  closeAllDropdowns();

  // Prevent body scroll
  document.body.style.overflow = 'hidden';
}

/**
 * Close the mobile menu
 */
export function closeMobileMenu() {
  if (drawerElement) {
    drawerElement.classList.remove('open');
  }
  if (overlayElement) {
    overlayElement.classList.remove('visible');
  }
  isOpen = false;

  // Restore body scroll
  document.body.style.overflow = '';
}

/**
 * Populate mobile menu with content
 */
function populateMobileMenu() {
  const content = document.getElementById('mobile-menu-content');
  if (!content) return;

  content.innerHTML = '';

  // Drawing Tools Section
  const drawSection = createMobileSection('🎨 Drawing Tools', [
    { id: 'draw-marker-btn', text: 'Marker', icon: '📍' },
    { id: 'draw-line-btn', text: 'Line', icon: '📏' },
    { id: 'draw-polygon-btn', text: 'Polygon', icon: '⬡' },
    { id: 'draw-radius-btn', text: 'Radius', icon: '⭕' },
    { id: 'draw-measure-btn', text: 'Measure', icon: '📐' }
  ]);
  content.appendChild(drawSection);

  // Map Actions Section
  const actionsSection = createMobileSection('🗺️ Map Actions', [
    { id: 'split-toggle', text: 'Toggle Split Screen', icon: '⇄' },
    { id: 'osm-search-trigger', text: 'Add OSM Feature', icon: '➕' },
    { id: 'remove-features-btn', text: 'Remove Features', icon: '🗑️' }
  ]);
  content.appendChild(actionsSection);

  // Layers Section (opens dropdown)
  const layersSection = createMobileSection('📚 Layers', [
    { action: 'open-layers', text: 'Manage Layers', icon: '📋' }
  ]);
  content.appendChild(layersSection);

  // Wire up the actions
  wireMobileActions(content);
}

/**
 * Create a mobile menu section
 */
function createMobileSection(title, items) {
  const section = document.createElement('div');
  section.className = 'mobile-menu-section';

  const header = document.createElement('div');
  header.className = 'mobile-menu-section-header';
  header.textContent = title;
  section.appendChild(header);

  items.forEach(item => {
    const button = document.createElement('button');
    button.className = 'mobile-menu-item';
    button.dataset.id = item.id || '';
    button.dataset.action = item.action || '';

    const icon = document.createElement('span');
    icon.className = 'mobile-menu-item-icon';
    icon.textContent = item.icon || '';

    const text = document.createElement('span');
    text.className = 'mobile-menu-item-text';
    text.textContent = item.text;

    button.appendChild(icon);
    button.appendChild(text);
    section.appendChild(button);
  });

  return section;
}

/**
 * Wire up mobile menu actions
 */
function wireMobileActions(content) {
  content.addEventListener('click', (e) => {
    const item = e.target.closest('.mobile-menu-item');
    if (!item) return;

    const id = item.dataset.id;
    const action = item.dataset.action;

    // Handle special actions
    if (action === 'open-layers') {
      closeMobileMenu();
      const layersToggle = document.getElementById('layers-toggle');
      if (layersToggle) {
        layersToggle.click();
      }
      return;
    }

    // Handle button clicks by ID
    if (id) {
      const originalButton = document.getElementById(id);
      if (originalButton) {
        closeMobileMenu();
        originalButton.click();
      }
    }
  });
}

// Add CSS for mobile menu
const mobileMenuCSS = `
  /* Hamburger button */
  #mobile-menu-toggle {
    display: none;
  }

  @media (max-width: 767px) {
    #mobile-menu-toggle {
      display: flex;
    }

    /* Mobile Drawer */
    .mobile-menu-drawer {
      position: fixed;
      top: 64px;
      right: -280px;
      width: 280px;
      height: calc(100vh - 64px);
      background: var(--header-bg);
      box-shadow: -2px 0 8px rgba(0, 0, 0, 0.15);
      z-index: 1002;
      transition: right 0.3s ease;
      display: flex;
      flex-direction: column;
    }

    .mobile-menu-drawer.open {
      right: 0;
    }

    /* Mobile Drawer Header */
    .mobile-menu-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px;
      border-bottom: 1px solid var(--header-border);
      background: var(--header-bg-elevated);
    }

    .mobile-menu-title {
      font-size: 18px;
      font-weight: 600;
      color: var(--header-text);
    }

    .mobile-menu-close {
      background: none;
      border: none;
      padding: 4px;
      cursor: pointer;
      color: var(--header-text-muted);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .mobile-menu-close:hover {
      color: var(--header-text);
    }

    /* Mobile Menu Content */
    .mobile-menu-content {
      flex: 1;
      overflow-y: auto;
      padding: 8px 0;
    }

    /* Mobile Menu Section */
    .mobile-menu-section {
      margin-bottom: 16px;
    }

    .mobile-menu-section-header {
      padding: 12px 16px 8px;
      font-size: 12px;
      font-weight: 600;
      color: var(--header-text-light);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    /* Mobile Menu Item */
    .mobile-menu-item {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      padding: 14px 16px;
      border: none;
      background: var(--header-bg);
      text-align: left;
      cursor: pointer;
      transition: background 0.15s ease;
      box-sizing: border-box;
    }

    .mobile-menu-item:hover {
      background: var(--header-bg-elevated);
    }

    .mobile-menu-item-icon {
      font-size: 20px;
      flex-shrink: 0;
    }

    .mobile-menu-item-text {
      font-size: 15px;
      color: var(--header-text);
    }

    /* Mobile Menu Overlay */
    .mobile-menu-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 1001;
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.3s ease, visibility 0.3s ease;
    }

    .mobile-menu-overlay.visible {
      opacity: 1;
      visibility: visible;
    }
  }
`;

// Inject CSS
const styleElement = document.createElement('style');
styleElement.textContent = mobileMenuCSS;
document.head.appendChild(styleElement);

// Initialize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMobileMenu);
} else {
  initMobileMenu();
}
