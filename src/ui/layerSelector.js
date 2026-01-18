import { hardcodedLayers } from '../config/constants.js';
import flatpickr from 'flatpickr';
import 'flatpickr/dist/flatpickr.min.css';
import { fetchLayerAvailability } from '../api/nasaAvailability.js';

export function createLayerSelectorDropdown(initialId, onChange, onDateChange) {
  const container = document.createElement('div');
  container.className = 'layer-selector-container';
  container.style.position = 'relative';
  container.style.width = '100%';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'overlay-dropdown-btn';
  button.style.width = '100%';
  button.style.textAlign = 'left';
  button.style.padding = '10px 12px';
  button.style.borderRadius = '8px';
  button.style.border = '1px solid #ccc';
  button.style.background = 'white';
  button.style.cursor = 'pointer';
  button.style.fontSize = '0.95em';
  button.style.display = 'flex';
  button.style.justifyContent = 'space-between';
  button.style.alignItems = 'center';

  const labelSpan = document.createElement('span');
  labelSpan.textContent = 'Basemap';
  labelSpan.style.fontWeight = 'bold';
  labelSpan.style.color = '#555';

  const valueSpan = document.createElement('span');
  const initialLayer = hardcodedLayers.find(l => l.id === initialId);
  valueSpan.textContent = initialLayer ? initialLayer.name : 'Select...';
  valueSpan.style.color = '#888';
  valueSpan.style.fontSize = '0.9em';

  button.appendChild(labelSpan);
  button.appendChild(valueSpan);

  const panel = document.createElement('div');
  panel.className = 'overlay-dropdown-panel';
  panel.style.display = 'none';
  panel.style.position = 'relative';
  panel.style.marginTop = '4px';
  panel.style.background = 'rgba(255,255,255,0.97)';
  panel.style.padding = '10px 12px';
  panel.style.borderRadius = '10px';
  panel.style.border = '1px solid #eee';
  panel.style.boxSizing = 'border-box';
  panel.style.flexDirection = 'column';
  panel.style.gap = '8px';

  const select = document.createElement('select');
  select.id = 'baseLayerSelector';
  select.style.width = '100%';
  select.style.padding = '6px';
  select.style.borderRadius = '6px';
  select.style.border = '1px solid #ccc';
  select.style.background = 'white';
  select.style.cursor = 'pointer';
  select.style.outline = 'none';

  hardcodedLayers.forEach(layer => {
    const option = document.createElement('option');
    option.value = layer.id;
    option.textContent = layer.name;
    select.appendChild(option);
  });

  const dateInput = document.createElement('input');
  dateInput.type = 'text'; // Flatpickr uses text
  dateInput.style.width = '100%';
  dateInput.style.padding = '6px';
  dateInput.style.borderRadius = '6px';
  dateInput.style.border = '1px solid #ccc';
  dateInput.style.boxSizing = 'border-box';
  dateInput.style.display = 'none';
  dateInput.placeholder = 'Select date...';

  let fp = null;

  const updateVisibility = async (val) => {
    const layer = hardcodedLayers.find(l => l.id === val);
    if (layer && layer.hasTime) {
      dateInput.style.display = 'block';

      const config = {
        defaultDate: layer.date || new Date().toISOString().split('T')[0],
        dateFormat: "Y-m-d",
        onChange: (selectedDates, dateStr) => {
          if (onDateChange) onDateChange(dateStr);
        }
      };

      // If it's a NASA layer, fetch availability
      if (layer.type === 'nasa' && layer.nasaLayerId) {
        const availability = await fetchLayerAvailability(layer.nasaLayerId);
        if (availability && availability.ranges.length > 0) {
          config.enable = availability.ranges.map(r => ({ from: r.from, to: r.to }));
          // Set the default date to the last available day if current default is outside ranges
          // For now, just trust the default or use the last range's end
        }
      }

      if (fp) fp.destroy();
      fp = flatpickr(dateInput, config);
    } else {
      dateInput.style.display = 'none';
      if (fp) fp.destroy();
      fp = null;
    }
  };

  select.value = initialId;
  updateVisibility(initialId);

  panel.appendChild(select);
  panel.appendChild(dateInput);

  button.addEventListener('click', (e) => {
    e.stopPropagation();
    const isVisible = panel.style.display === 'flex';
    if (isVisible) {
      panel.style.display = 'none';
    } else {
      // Close other accordions in the same container
      const column = container.closest('.ui-column-container');
      if (column) {
        column.querySelectorAll('.overlay-dropdown-panel').forEach(p => {
          if (p !== panel) p.style.display = 'none';
        });
      }
      panel.style.display = 'flex';
    }
  });

  select.addEventListener('change', function () {
    updateVisibility(this.value);
    const layer = hardcodedLayers.find(l => l.id === this.value);
    valueSpan.textContent = layer ? layer.name : this.value;
    onChange(this.value);
  });

  container.appendChild(button);
  container.appendChild(panel);

  return container;
}


