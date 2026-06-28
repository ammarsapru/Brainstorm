type ToastType = 'error' | 'success' | 'info';

function getOrCreateContainer(): HTMLElement {
  const existing = document.getElementById('bs-toast-container');
  if (existing) return existing;
  const el = document.createElement('div');
  el.id = 'bs-toast-container';
  el.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:99999;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
  document.body.appendChild(el);
  return el;
}

function removeToast(toast: HTMLElement) {
  toast.style.opacity = '0';
  toast.style.transform = 'translateY(8px)';
  setTimeout(() => {
    toast.remove();
    const container = document.getElementById('bs-toast-container');
    if (container && container.childElementCount === 0) container.remove();
  }, 250);
}

export const showToast = (message: string, type: ToastType = 'info', durationMs = 4000) => {
  const container = getOrCreateContainer();
  const bg = type === 'error' ? '#ef4444' : type === 'success' ? '#22c55e' : '#3b82f6';
  const toast = document.createElement('div');
  toast.style.cssText = `background:${bg};color:#fff;padding:10px 16px;border-radius:10px;font-size:14px;font-family:sans-serif;max-width:320px;box-shadow:0 4px 12px rgba(0,0,0,0.25);opacity:0;transform:translateY(8px);transition:opacity 0.2s,transform 0.2s;pointer-events:auto;line-height:1.4;`;
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });
  setTimeout(() => removeToast(toast), durationMs);
};

/** Shows a persistent "Uploading filename" toast. Returns a dismiss function to call when done. */
export const showUploadToast = (filename: string): (() => void) => {
  if (!document.getElementById('bs-spin-style')) {
    const style = document.createElement('style');
    style.id = 'bs-spin-style';
    style.textContent = '@keyframes bs-spin{to{transform:rotate(360deg)}}';
    document.head.appendChild(style);
  }

  const container = getOrCreateContainer();
  const toast = document.createElement('div');
  toast.style.cssText = 'display:flex;align-items:center;gap:10px;background:#1f2937;color:#f9fafb;padding:10px 14px;border-radius:10px;font-size:13px;font-family:sans-serif;max-width:320px;box-shadow:0 4px 16px rgba(0,0,0,0.35);opacity:0;transform:translateY(8px);transition:opacity 0.2s,transform 0.2s;pointer-events:auto;line-height:1.4;';

  const spinner = document.createElement('div');
  spinner.style.cssText = 'width:13px;height:13px;border:2px solid rgba(255,255,255,0.2);border-top-color:#fff;border-radius:50%;animation:bs-spin 0.75s linear infinite;flex-shrink:0;';

  const label = document.createElement('span');
  label.textContent = `Uploading ${filename}`;

  toast.appendChild(spinner);
  toast.appendChild(label);
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });

  return () => removeToast(toast);
};
