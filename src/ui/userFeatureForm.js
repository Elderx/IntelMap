import { state } from '../state/store.js';

export function openUserFeatureForm(kind, initial, onSubmit, onCancel, options = {}) {
  // Remove existing form if present
  if (window.__userFeatureForm) window.__userFeatureForm.remove();

  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.right = '0';
  overlay.style.bottom = '0';
  overlay.style.background = 'rgba(0,0,0,0.3)';
  overlay.style.zIndex = 2000;
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';

  const panel = document.createElement('div');
  panel.style.background = 'white';
  panel.style.borderRadius = '10px';
  panel.style.boxShadow = '0 8px 24px rgba(0,0,0,0.2)';
  panel.style.padding = '16px';
  panel.style.minWidth = '280px';
  panel.style.maxWidth = '420px';

  const title = document.createElement('div');
  title.textContent = kind === 'marker' ? 'Add Marker' : 'Add Polygon';
  title.style.fontWeight = 'bold';
  title.style.fontSize = '1.1em';
  title.style.marginBottom = '10px';
  panel.appendChild(title);

  // Owner label (read-only)
  if (options.ownerUsername) {
    const owner = document.createElement('div');
    owner.textContent = `Owner: ${options.ownerUsername}`;
    owner.style.fontSize = '0.9em';
    owner.style.color = '#666';
    owner.style.marginBottom = '8px';
    panel.appendChild(owner);
  }

  const inputTitle = document.createElement('input');
  inputTitle.type = 'text';
  inputTitle.placeholder = 'Title (optional)';
  inputTitle.style.width = '100%';
  inputTitle.style.marginBottom = '8px';
  inputTitle.value = initial.title || '';
  panel.appendChild(inputTitle);

  const inputDesc = document.createElement('textarea');
  inputDesc.placeholder = 'Description (optional)';
  inputDesc.style.width = '100%';
  inputDesc.style.height = '80px';
  inputDesc.style.marginBottom = '8px';
  inputDesc.value = initial.description || '';
  panel.appendChild(inputDesc);

  const colorLabel = document.createElement('label');
  colorLabel.textContent = 'Color: ';
  colorLabel.style.marginRight = '8px';
  const inputColor = document.createElement('input');
  inputColor.type = 'color';
  inputColor.value = initial.color || (kind === 'marker' ? '#00bcd4' : '#ff9800');
  colorLabel.appendChild(inputColor);
  panel.appendChild(colorLabel);

  // Share dropdown (multi-select)
  const shareWrap = document.createElement('div');
  shareWrap.style.marginTop = '8px';
  if (Array.isArray(options.users) && options.users.length > 0) {
    const shareLabel = document.createElement('div');
    shareLabel.textContent = 'Share with users:';
    shareLabel.style.fontSize = '0.9em';
    shareLabel.style.marginBottom = '4px';
    const multi = document.createElement('select');
    multi.multiple = true;
    multi.size = Math.min(6, options.users.length);
    multi.style.width = '100%';
    multi.style.padding = '6px';
    multi.style.borderRadius = '6px';
    multi.style.border = '1px solid #ccc';
    const selectedSet = new Set(options.selectedSharedIds || []);
    options.users.forEach(u => {
      const opt = document.createElement('option');
      opt.value = String(u.id);
      opt.textContent = u.username;
      if (selectedSet.has(u.id)) opt.selected = true;
      multi.appendChild(opt);
    });
    shareWrap.appendChild(shareLabel);
    shareWrap.appendChild(multi);
    panel.appendChild(shareWrap);
    panel.__shareSelect = multi;
  }

  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.justifyContent = 'flex-end';
  actions.style.gap = '8px';
  actions.style.marginTop = '10px';

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.padding = '8px 12px';
  cancelBtn.onclick = () => { overlay.remove(); onCancel && onCancel(); };

  const deleteBtn = document.createElement('button');
  if (options.allowDelete) {
    deleteBtn.textContent = 'Delete';
    deleteBtn.style.padding = '8px 12px';
    deleteBtn.style.background = '#e53935';
    deleteBtn.style.color = 'white';
    deleteBtn.style.border = 'none';
    deleteBtn.style.borderRadius = '6px';
    deleteBtn.style.cursor = 'pointer';
    deleteBtn.onclick = () => {
      overlay.remove();
      options.onDelete && options.onDelete();
    };
  }

  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';
  saveBtn.classList.add('save-feature-btn'); // Identifying class for tests
  saveBtn.style.padding = '8px 12px';
  saveBtn.style.background = '#1976d2';
  saveBtn.style.color = 'white';
  saveBtn.style.border = 'none';
  saveBtn.style.borderRadius = '6px';
  saveBtn.style.cursor = 'pointer';
  saveBtn.onclick = () => {
    const payload = {
      title: inputTitle.value.trim(),
      description: inputDesc.value.trim(),
      color: inputColor.value,
    };
    if (panel.__shareSelect) {
      const ids = Array.from(panel.__shareSelect.selectedOptions).map(o => parseInt(o.value, 10)).filter(n => Number.isFinite(n));
      payload.sharedUserIds = ids;
    }
    overlay.remove();
    onSubmit && onSubmit(payload);
  };

  actions.appendChild(cancelBtn);
  if (options.allowDelete) actions.appendChild(deleteBtn);
  actions.appendChild(saveBtn);
  panel.appendChild(actions);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  window.__userFeatureForm = overlay;
}
