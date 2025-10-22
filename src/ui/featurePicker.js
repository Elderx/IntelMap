export function openFeaturePicker(features, onPick, onCancel) {
  if (window.__featurePicker) window.__featurePicker.remove();

  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.right = '0';
  overlay.style.bottom = '0';
  overlay.style.background = 'rgba(0,0,0,0.3)';
  overlay.style.zIndex = 2100;
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';

  const panel = document.createElement('div');
  panel.style.background = 'white';
  panel.style.borderRadius = '10px';
  panel.style.boxShadow = '0 8px 24px rgba(0,0,0,0.2)';
  panel.style.padding = '12px 14px';
  panel.style.minWidth = '260px';
  panel.style.maxWidth = '380px';

  const title = document.createElement('div');
  title.textContent = 'Select a feature to edit';
  title.style.fontWeight = 'bold';
  title.style.marginBottom = '8px';
  panel.appendChild(title);

  const list = document.createElement('div');
  features.forEach((f, idx) => {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '8px';
    row.style.padding = '8px';
    row.style.cursor = 'pointer';
    row.style.borderRadius = '6px';
    row.onmouseenter = () => row.style.background = '#f5f5f5';
    row.onmouseleave = () => row.style.background = 'transparent';

    const colorDot = document.createElement('div');
    colorDot.style.width = '12px';
    colorDot.style.height = '12px';
    colorDot.style.borderRadius = '50%';
    colorDot.style.background = f.get('color') || '#1976d2';

    const label = document.createElement('div');
    const type = f.get('userType') === 'marker' ? 'Marker' : 'Polygon';
    const txt = f.get('title') ? `${type}: ${f.get('title')}` : type;
    label.textContent = txt;
    label.style.flex = '1';

    row.appendChild(colorDot);
    row.appendChild(label);
    row.onclick = () => { overlay.remove(); onPick && onPick(f); };
    list.appendChild(row);
  });
  panel.appendChild(list);

  const actions = document.createElement('div');
  actions.style.marginTop = '10px';
  actions.style.display = 'flex';
  actions.style.justifyContent = 'flex-end';

  const cancel = document.createElement('button');
  cancel.textContent = 'Cancel';
  cancel.style.padding = '6px 10px';
  cancel.onclick = () => { overlay.remove(); onCancel && onCancel(); };
  actions.appendChild(cancel);
  panel.appendChild(actions);

  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  window.__featurePicker = overlay;
}
