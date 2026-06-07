type ToastType = 'error' | 'success' | 'info';

export const showToast = (message: string, type: ToastType = 'info', durationMs = 4000) => {
  const existing = document.getElementById('bs-toast-container');
  const container = existing ?? (() => {
    const el = document.createElement('div');
    el.id = 'bs-toast-container';
    el.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:99999;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
    document.body.appendChild(el);
    return el;
  })();

  const bg = type === 'error' ? '#ef4444' : type === 'success' ? '#22c55e' : '#3b82f6';
  const toast = document.createElement('div');
  toast.style.cssText = `background:${bg};color:#fff;padding:10px 16px;border-radius:10px;font-size:14px;font-family:sans-serif;max-width:320px;box-shadow:0 4px 12px rgba(0,0,0,0.25);opacity:0;transform:translateY(8px);transition:opacity 0.2s,transform 0.2s;pointer-events:auto;line-height:1.4;`;
  toast.textContent = message;
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    setTimeout(() => {
      toast.remove();
      if (container.childElementCount === 0) container.remove();
    }, 250);
  }, durationMs);
};
