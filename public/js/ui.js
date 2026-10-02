export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function imageUrl(value) {
  return typeof value === 'string' && (/^https:\/\//i.test(value) || /^\/assets\/[a-z0-9.-]+$/i.test(value) || /^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(value)) ? value : '/assets/poster.svg';
}
export const icon = (name, size = 20) => {
  const paths = {
    search: '<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    book: '<path d="M12 5v15M3 4c4-1 6 0 9 2 3-2 5-3 9-2v14c-4-1-6 0-9 2-3-2-5-3-9-2z"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    sparkle: '<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3z"/>',
    star: '<path d="m12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.3-5.7-3-5.7 3 1.1-6.3-4.6-4.5 6.4-.9z"/>',
    chevron: '<path d="m9 5 7 7-7 7"/>', download: '<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
    volume: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7m3-10a9 9 0 0 1 0 13"/>',
    volumeOff: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="m16 9 5 6m0-6-5 6"/>',
    shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m8 12 3 3 5-6"/>',
    check: '<path d="m5 12 4 4L19 6"/>', moon: '<path d="M20 15a9 9 0 0 1-11-11 9 9 0 1 0 11 11z"/>',
    trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
    refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9a7 7 0 0 1 11.6-2L20 12M4 12l2.8 5a7 7 0 0 0 11.6-2"/>'
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.sparkle}</svg>`;
};
export const empty = (title, detail, action = '') => `<div class="empty">${icon('book', 34)}<h3>${esc(title)}</h3><p>${esc(detail)}</p>${action}</div>`;
export function field(label, name, value = '', options = {}) {
  const { type = 'text', required = false, min, max, step, placeholder = '', maxlength = 240 } = options;
  return `<label class="field">${esc(label)}<input type="${type}" name="${name}" value="${esc(value)}" ${required ? 'required' : ''} ${min != null ? `min="${min}"` : ''} ${max != null ? `max="${max}"` : ''} ${step ? `step="${step}"` : ''} maxlength="${maxlength}" placeholder="${esc(placeholder)}"></label>`;
}
export const select = (label, name, values, current) => `<label class="field">${esc(label)}<select name="${name}">${Object.entries(values).map(([key, value]) => `<option value="${esc(key)}" ${String(current) === key ? 'selected' : ''}>${esc(value)}</option>`).join('')}</select></label>`;
export function toast(message, error = false) {
  const node = document.querySelector('#toast'); node.textContent = message; node.className = `visible ${error ? 'error' : ''}`;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => node.className = '', error ? 7000 : 3500);
}
export function openDialog(title, content) {
  const dialog = document.querySelector('#modal');
  dialog.innerHTML = `<div class="dialog-top"><div><span class="eyebrow">YOUR COSMOS</span><h2 id="dialog-title">${esc(title)}</h2></div><button class="icon-button" data-action="close-modal" aria-label="Close dialog">${icon('close')}</button></div>${content}`;
  if (!dialog.open) dialog.showModal();
}
