import { state } from '../state/store.js';

export function createOSMPopup() {
  if (state.osmHoverPopup) state.osmHoverPopup.remove();
  if (state.osmClickPopup) state.osmClickPopup.remove();

  // Hover popup (auto-closes on mouse leave)
  const hoverPopup = createPopupElement('osm-hover-popup', 1002);

  // Click popup (stays open until closed)
  const clickPopup = createPopupElement('osm-click-popup', 1003);
  clickPopup.style.pointerEvents = 'auto';

  // Close button for click popup
  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '×';
  closeBtn.title = 'Close';
  Object.assign(closeBtn.style, {
    position: 'absolute', top: '8px', right: '12px',
    background: 'none', border: 'none', fontSize: '1.2em',
    cursor: 'pointer', color: '#666', padding: '0',
    width: '20px', height: '20px', borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center'
  });

  closeBtn.onclick = (e) => { e.stopPropagation(); clickPopup.style.display = 'none'; };
  closeBtn.onmouseenter = () => closeBtn.style.background = '#f0f0f0';
  closeBtn.onmouseleave = () => closeBtn.style.background = 'none';

  clickPopup.appendChild(closeBtn);

  document.body.appendChild(hoverPopup);
  document.body.appendChild(clickPopup);

  state.osmHoverPopup = hoverPopup;
  state.osmClickPopup = clickPopup;
}

function createPopupElement(className, zIndex) {
  const el = document.createElement('div');
  el.className = className;
  Object.assign(el.style, {
    position: 'absolute', minWidth: '220px', maxWidth: '320px',
    background: 'rgba(255,255,255,0.98)', border: '2px solid #0077cc',
    borderRadius: '8px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
    padding: '12px 16px', zIndex: zIndex, fontSize: '0.9em',
    color: '#333', lineHeight: '1.4', pointerEvents: 'none',
    userSelect: 'text', display: 'none', top: '0', left: '0'
  });
  return el;
}

/**
 * Show popup for one or more features
 * @param {Array} features - Array of {feature, layer} objects
 * @param {Array} pixel - [x, y] coordinates
 * @param {Boolean} isClick - true for persistent click popup
 */
export function showOSMPopup(features, pixel, isClick = false) {
  const popup = isClick ? state.osmClickPopup : state.osmHoverPopup;
  if (!popup || !features || features.length === 0) return;

  // Clear previous content (keep close button for click popup)
  const children = Array.from(popup.children);
  children.forEach(c => { if (c.tagName !== 'BUTTON') c.remove(); });

  const container = document.createElement('div');

  if (typeof features === 'string') {
    container.innerHTML = features;
  } else if (features.length === 1) {
    // SINGLE FEATURE: Show details directly
    container.innerHTML = formatDetailView(features[0]);
  } else {
    // MULTIPLE FEATURES: Show list
    container.appendChild(createFeatureList(features, container, isClick));
  }

  popup.appendChild(container);
  popup.style.display = 'block';

  // Position logic
  positionPopup(popup, pixel);
}

function createFeatureList(features, container, isClick) {
  const listDiv = document.createElement('div');

  const header = document.createElement('div');
  header.textContent = `${features.length} Features Found`;
  header.style.cssText = 'font-weight:bold;margin-bottom:8px;border-bottom:1px solid #eee;padding-bottom:4px;color:#0077cc;';
  listDiv.appendChild(header);

  features.forEach((item, index) => {
    const layer = item.layer;
    const title = layer.get('osmTitle') || 'Unknown Layer';
    const color = layer.get('osmColor') || '#333';
    const type = item.feature.getGeometry().getType();

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;padding:6px;cursor:pointer;border-radius:4px;transition:background 0.2s;margin-bottom:2px;';

    // Allow clicking list items even in hover popup if user can reach it (mostly useful for click popup)
    if (isClick) {
      row.onmouseenter = () => row.style.background = '#f5f5f5';
      row.onmouseleave = () => row.style.background = 'transparent';
      row.onclick = () => {
        // Switch to detail view
        container.innerHTML = formatDetailView(item, true); // true = show back button

        const backBtn = container.querySelector('.osm-popup-back');
        if (backBtn) {
          backBtn.onclick = () => {
            container.innerHTML = '';
            container.appendChild(createFeatureList(features, container, isClick));
          };
        }
      };
    } else {
      // Hover popup list items aren't easily actionable without sticky logic, 
      // but we show them as a list at least.
    }

    const dot = document.createElement('div');
    dot.style.cssText = `width:10px;height:10px;border-radius:50%;background:${color};margin-right:8px;flex-shrink:0;`;

    const text = document.createElement('div');
    text.style.cssText = 'flex-grow:1;';
    text.innerHTML = `<div style="font-weight:500;">${title}</div><div style="font-size:0.8em;color:#666;">${type}</div>`;

    row.appendChild(dot);
    row.appendChild(text);
    listDiv.appendChild(row);
  });

  return listDiv;
}

function formatDetailView(item, showBack = false) {
  const { feature, layer } = item;
  const title = layer.get('osmTitle');
  const color = layer.get('osmColor');
  const props = feature.getProperties();
  const type = feature.getGeometry().getType();

  let html = `<div class="osm-popup-detail">`;

  if (showBack) {
    html += `<div class="osm-popup-back" style="cursor:pointer;color:#0077cc;font-size:0.9em;margin-bottom:8px;display:flex;align-items:center;">
      <span style="font-size:1.2em;margin-right:4px;">‹</span> Back to list
    </div>`;
  }

  html += `<div style="font-weight: bold; font-size: 1.1em; margin-bottom: 6px; color: ${color}; display: flex; align-items: center;">
      <div style="width: 12px; height: 12px; background: ${color}; border-radius: 50%; margin-right: 8px;"></div>
      ${title}
    </div>`;
  html += `<div style="font-size: 0.85em; color: #666; margin-bottom: 8px;">${type.toUpperCase()}</div>`;

  // Filter and show properties
  const relevantProps = Object.entries(props)
    .filter(([key, value]) =>
      key !== 'geometry' && value &&
      typeof value === 'string' && value.length < 100
    ).slice(0, 10);

  if (relevantProps.length > 0) {
    html += `<div style="border-top: 1px solid #eee; padding-top: 8px;">`;
    relevantProps.forEach(([key, value]) => {
      const displayKey = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      html += `<div style="margin-bottom: 4px;"><strong>${displayKey}:</strong> ${value}</div>`;
    });
    html += `</div>`;
  }

  html += `</div>`;
  return html;
}

function positionPopup(popup, pixel) {
  let x = pixel[0] + 15;
  let y = pixel[1] + 15;

  // Clamp to viewport
  const maxX = window.innerWidth - popup.offsetWidth - 20;
  const maxY = window.innerHeight - popup.offsetHeight - 20;

  if (x > maxX) x = maxX;
  if (y > maxY) y = maxY;

  popup.style.left = x + 'px';
  popup.style.top = y + 'px';
}

export function hideOSMPopup(isClick = false) {
  const popup = isClick ? state.osmClickPopup : state.osmHoverPopup;
  if (popup) popup.style.display = 'none';
}

// Deprecated, kept for compatibility if needed elsewhere
export function formatOSMFeatureInfo(feature, layerTitle, color) {
  return formatDetailView({ feature, layer: { get: (k) => k === 'osmTitle' ? layerTitle : color } });
}
