import { state } from '../state/store.js';

function ensureLegendPanel() {
  if (state.mapLegendPanel && document.body.contains(state.mapLegendPanel)) {
    return state.mapLegendPanel;
  }

  const panel = document.createElement('div');
  panel.className = 'map-legend-panel';
  panel.style.display = 'none';

  const title = document.createElement('button');
  title.type = 'button';
  title.className = 'map-legend-panel-title';
  title.setAttribute('aria-expanded', 'true');

  const titleText = document.createElement('span');
  titleText.className = 'map-legend-panel-title-text';
  titleText.textContent = 'Legend';

  const chevron = document.createElement('span');
  chevron.className = 'map-legend-panel-chevron';
  chevron.setAttribute('aria-hidden', 'true');

  title.append(titleText, chevron);
  title.addEventListener('click', () => {
    state.mapLegendCollapsed = !state.mapLegendCollapsed;
    renderLegendPanel();
  });

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
  const title = panel.querySelector('.map-legend-panel-title');
  const chevron = panel.querySelector('.map-legend-panel-chevron');

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
      const row = document.createElement(item.selectable ? 'label' : 'div');
      row.className = 'map-legend-row';
      if (item.selectable) {
        row.classList.add('map-legend-row-selectable');
      }
      if (item.selected) {
        row.classList.add('is-selected');
      }

      if (item.selectable) {
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'map-legend-checkbox';
        checkbox.checked = Boolean(item.selected);
        checkbox.addEventListener('change', () => {
          if (typeof item.onToggle === 'function') {
            item.onToggle(checkbox.checked);
          }
        });
        row.appendChild(checkbox);
      }

      if (item.color) {
        const swatch = document.createElement('span');
        swatch.className = 'map-legend-swatch';
        swatch.style.backgroundColor = item.color;
        row.appendChild(swatch);
      }

      const label = document.createElement('span');
      label.className = 'map-legend-label';
      label.textContent = item.label;
      row.appendChild(label);

      wrapper.appendChild(row);
    });

    body.appendChild(wrapper);
  });

  const collapsed = Boolean(state.mapLegendCollapsed);
  panel.classList.toggle('is-collapsed', collapsed);
  body.style.display = collapsed ? 'none' : 'grid';
  if (title) {
    title.setAttribute('aria-expanded', String(!collapsed));
  }
  if (chevron) {
    chevron.textContent = collapsed ? '▸' : '▾';
  }

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
