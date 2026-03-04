import { state } from '../state/store.js';

function ensureLegendPanel() {
  if (state.mapLegendPanel && document.body.contains(state.mapLegendPanel)) {
    return state.mapLegendPanel;
  }

  const panel = document.createElement('div');
  panel.className = 'map-legend-panel';
  panel.style.display = 'none';

  const title = document.createElement('div');
  title.className = 'map-legend-panel-title';
  title.textContent = 'Legend';

  const body = document.createElement('div');
  body.className = 'map-legend-panel-body';

  panel.append(title, body);
  document.body.appendChild(panel);

  state.mapLegendPanel = panel;
  state.mapLegendBody = body;

  return panel;
}

function renderLegendPanel() {
  const panel = ensureLegendPanel();
  const body = state.mapLegendBody;

  body.innerHTML = '';

  const sections = Array.from(state.mapLegendSections.entries());
  if (!sections.length) {
    panel.style.display = 'none';
    return;
  }

  sections.forEach(([id, section]) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'map-legend-section';
    wrapper.dataset.legendId = id;

    if (section.title) {
      const heading = document.createElement('div');
      heading.className = 'map-legend-section-title';
      heading.textContent = section.title;
      wrapper.appendChild(heading);
    }

    (section.items || []).forEach((item) => {
      const row = document.createElement('div');
      row.className = 'map-legend-row';

      if (item.color) {
        const swatch = document.createElement('span');
        swatch.className = 'map-legend-swatch';
        swatch.style.backgroundColor = item.color;
        row.appendChild(swatch);
      }

      const label = document.createElement('span');
      label.textContent = item.label;
      row.appendChild(label);

      wrapper.appendChild(row);
    });

    body.appendChild(wrapper);
  });

  panel.style.display = 'block';
}

export function initMapLegendPanel() {
  ensureLegendPanel();
  renderLegendPanel();
}

export function setMapLegendSection(id, section) {
  if (!id || !section) {
    return;
  }

  state.mapLegendSections.set(id, section);
  renderLegendPanel();
}

export function removeMapLegendSection(id) {
  if (!id) {
    return;
  }

  state.mapLegendSections.delete(id);
  renderLegendPanel();
}

export function clearMapLegendSections() {
  state.mapLegendSections.clear();
  renderLegendPanel();
}
