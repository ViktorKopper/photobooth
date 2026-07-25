// The app's only interruption channel.
//
// Everything here used to be a native alert(): blocking, unstyled, and
// completely at odds with the rest of the interface.

export function showToast(message, { tone = 'default' } = {}) {
  let toast = document.querySelector('#toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
  }

  toast.className = `toast toast-${tone}`;
  // Problems interrupt what someone was doing, so they're announced
  // assertively; confirmations wait their turn.
  toast.setAttribute('aria-live', tone === 'error' ? 'assertive' : 'polite');
  toast.setAttribute('role', tone === 'error' ? 'alert' : 'status');

  toast.textContent = message;
  toast.classList.remove('toast-visible');
  // Force reflow so retriggering the class restarts the animation even if a
  // toast is already showing.
  void toast.offsetWidth;
  toast.classList.add('toast-visible');

  window.clearTimeout(showToast.timer);
  // Errors linger: they carry information the person may need to act on,
  // and are easy to miss if they slide away as fast as a confirmation.
  showToast.timer = window.setTimeout(
    () => toast.classList.remove('toast-visible'),
    tone === 'error' ? 4200 : 1800
  );
}

export function showError(message, fallback) {
  showToast(message || fallback, { tone: 'error' });
}
