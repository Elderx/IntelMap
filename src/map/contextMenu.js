import { toLonLat } from 'ol/proj.js';
import { unByKey } from 'ol/Observable.js';
import { forward as mgrsForward } from 'mgrs';
import { state } from '../state/store.js';

const menuAttachmentByKey = {
  main: null,
  left: null,
  right: null
};

const moveStartKeys = {
  main: null,
  left: null,
  right: null
};

let menuElement = null;
let menuItemsElement = null;
let activeContext = null;
let globalListenersBound = false;

const contextMenuActions = [];

function getMap(mapKey) {
  if (mapKey === 'main') {
    return state.map;
  }

  if (mapKey === 'left') {
    return state.leftMap;
  }

  return state.rightMap;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatDecimalCoordinates(lon, lat) {
  return `${lat.toFixed(7)}, ${lon.toFixed(7)}`;
}

function formatMgrsCoordinates(lon, lat) {
  return mgrsForward([lon, lat], 5);
}

async function writeTextToClipboard(text) {
  if (!text || typeof text !== 'string') {
    return false;
  }

  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (error) {
    console.warn('[ContextMenu] Clipboard API failed, falling back to execCommand:', error);
  }

  try {
    const helper = document.createElement('textarea');
    helper.value = text;
    helper.setAttribute('readonly', 'readonly');
    helper.style.position = 'fixed';
    helper.style.left = '-9999px';
    helper.style.opacity = '0';
    document.body.appendChild(helper);
    helper.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(helper);
    return copied;
  } catch (error) {
    console.warn('[ContextMenu] Copy fallback failed:', error);
    return false;
  }
}

function ensureMenuElement() {
  if (menuElement) {
    return;
  }

  menuElement = document.createElement('div');
  menuElement.className = 'map-context-menu';
  menuElement.setAttribute('role', 'menu');
  menuElement.setAttribute('aria-hidden', 'true');

  menuItemsElement = document.createElement('div');
  menuItemsElement.className = 'map-context-menu-items';
  menuElement.appendChild(menuItemsElement);

  document.body.appendChild(menuElement);
}

function hideContextMenu() {
  if (!menuElement) {
    return;
  }

  menuElement.classList.remove('is-open');
  menuElement.setAttribute('aria-hidden', 'true');
  menuElement.style.left = '-9999px';
  menuElement.style.top = '-9999px';
  activeContext = null;
}

async function executeAction(action) {
  if (!activeContext || !action || typeof action.onSelect !== 'function') {
    hideContextMenu();
    return;
  }

  try {
    await action.onSelect(activeContext);
  } catch (error) {
    console.warn('[ContextMenu] Action failed:', action.id, error);
  } finally {
    hideContextMenu();
  }
}

function renderMenuActions(actions) {
  if (!menuItemsElement) {
    return;
  }

  menuItemsElement.innerHTML = '';

  actions.forEach((action) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'map-context-menu-item';
    item.textContent = action.label;
    item.setAttribute('role', 'menuitem');
    item.addEventListener('click', (event) => {
      event.stopPropagation();
      executeAction(action);
    });
    menuItemsElement.appendChild(item);
  });
}

function getVisibleActions(context) {
  return contextMenuActions
    .slice()
    .sort((left, right) => (left.order ?? 1000) - (right.order ?? 1000))
    .filter((action) => {
      if (typeof action.isVisible !== 'function') {
        return true;
      }

      try {
        return Boolean(action.isVisible(context));
      } catch (error) {
        console.warn('[ContextMenu] isVisible failed:', action.id, error);
        return false;
      }
    });
}

function openContextMenu(nativeEvent, mapKey) {
  const map = getMap(mapKey);
  if (!map || !menuElement) {
    return;
  }

  nativeEvent.preventDefault();

  const pixel = map.getEventPixel(nativeEvent);
  const coordinate = map.getCoordinateFromPixel(pixel);
  if (!coordinate) {
    hideContextMenu();
    return;
  }

  const [lon, lat] = toLonLat(coordinate);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    hideContextMenu();
    return;
  }

  activeContext = {
    mapKey,
    map,
    coordinate,
    pixel,
    lon,
    lat
  };

  const actions = getVisibleActions(activeContext);
  if (!actions.length) {
    hideContextMenu();
    return;
  }

  renderMenuActions(actions);

  menuElement.classList.add('is-open');
  menuElement.setAttribute('aria-hidden', 'false');
  menuElement.style.visibility = 'hidden';
  menuElement.style.left = '0px';
  menuElement.style.top = '0px';

  const rect = menuElement.getBoundingClientRect();
  const margin = 8;
  const x = clamp(nativeEvent.clientX, margin, window.innerWidth - rect.width - margin);
  const y = clamp(nativeEvent.clientY, margin, window.innerHeight - rect.height - margin);

  menuElement.style.left = `${x}px`;
  menuElement.style.top = `${y}px`;
  menuElement.style.visibility = 'visible';
}

function bindGlobalListeners() {
  if (globalListenersBound) {
    return;
  }

  document.addEventListener('pointerdown', (event) => {
    if (!menuElement || !menuElement.classList.contains('is-open')) {
      return;
    }

    if (!menuElement.contains(event.target)) {
      hideContextMenu();
    }
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      hideContextMenu();
    }
  });

  window.addEventListener('resize', hideContextMenu);
  window.addEventListener('blur', hideContextMenu);
  globalListenersBound = true;
}

function detachMapContextMenu(mapKey) {
  const attachment = menuAttachmentByKey[mapKey];
  if (attachment?.viewport) {
    attachment.viewport.removeEventListener('contextmenu', attachment.onContextMenu);
  }
  menuAttachmentByKey[mapKey] = null;

  if (moveStartKeys[mapKey]) {
    unByKey(moveStartKeys[mapKey]);
    moveStartKeys[mapKey] = null;
  }
}

function attachMapContextMenu(mapKey, map) {
  if (!map || typeof map.getViewport !== 'function') {
    return;
  }

  if (typeof map.getTarget === 'function' && !map.getTarget()) {
    detachMapContextMenu(mapKey);
    return;
  }

  detachMapContextMenu(mapKey);

  const viewport = map.getViewport();
  const onContextMenu = (event) => openContextMenu(event, mapKey);
  viewport.addEventListener('contextmenu', onContextMenu);
  menuAttachmentByKey[mapKey] = { viewport, onContextMenu };

  moveStartKeys[mapKey] = map.on('movestart', () => {
    hideContextMenu();
  });
}

function installDefaultActions() {
  if (contextMenuActions.length) {
    return;
  }

  contextMenuActions.push(
    {
      id: 'copy-coordinates-decimal',
      label: 'Copy coordinates',
      order: 10,
      onSelect: async (context) => {
        await writeTextToClipboard(formatDecimalCoordinates(context.lon, context.lat));
      }
    },
    {
      id: 'copy-coordinates-mgrs',
      label: 'Copy coordinates (MGRS)',
      order: 20,
      onSelect: async (context) => {
        await writeTextToClipboard(formatMgrsCoordinates(context.lon, context.lat));
      }
    }
  );
}

export function registerMapContextMenuAction(action) {
  if (!action || typeof action.id !== 'string' || typeof action.label !== 'string' || typeof action.onSelect !== 'function') {
    throw new Error('[ContextMenu] Invalid action');
  }

  const existingIndex = contextMenuActions.findIndex((candidate) => candidate.id === action.id);
  if (existingIndex !== -1) {
    contextMenuActions.splice(existingIndex, 1, action);
    return;
  }

  contextMenuActions.push(action);
}

export function setupMapContextMenu() {
  ensureMenuElement();
  bindGlobalListeners();
  installDefaultActions();

  attachMapContextMenu('main', state.map);
  attachMapContextMenu('left', state.leftMap);
  attachMapContextMenu('right', state.rightMap);
}

export function cleanupMapContextMenu() {
  detachMapContextMenu('main');
  detachMapContextMenu('left');
  detachMapContextMenu('right');
  hideContextMenu();
}
