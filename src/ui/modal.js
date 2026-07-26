// Shared behaviour for the overlays that take over the screen.
//
// The develop overlay already did all of this — dialog semantics, Escape, a
// click on the backdrop — and the caption and doodle editors did none of it.
// Tab walked straight out of them into the page underneath, and Escape did
// nothing, which on a phone means the only way out is the Cancel button.
//
// Rather than a third copy, this is the one place it lives.

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

function focusableWithin(root) {
  return [...root.querySelectorAll(FOCUSABLE)].filter(
    // An element inside a hidden panel is not reachable, and trapping onto one
    // would strand the focus ring somewhere invisible.
    (node) => node.offsetParent !== null || node === document.activeElement
  );
}

/**
 * Marks an element as a modal dialog and wires the two keys everyone expects.
 *
 * Returns { open, close } rather than doing it immediately: these overlays are
 * built once with the room shell and shown many times.
 */
export function createModal(overlay, { label, onClose = () => {} } = {}) {
  if (!overlay) return { open() {}, close() {} };

  overlay.setAttribute('role', 'dialog');
  // Tells assistive tech the rest of the page is inert while this is up —
  // otherwise a screen reader happily reads the booth behind it.
  overlay.setAttribute('aria-modal', 'true');
  if (label) overlay.setAttribute('aria-label', label);

  // Remembered so closing puts the focus ring back where it came from, rather
  // than dumping it at the top of the document.
  let returnFocusTo = null;
  let isOpen = false;

  const onKeyDown = (event) => {
    if (!isOpen) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }

    if (event.key !== 'Tab') return;

    const focusable = focusableWithin(overlay);
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    // Wrapped by hand: without this, Tab from the last control lands on the
    // booth behind the overlay, which is still visible through it.
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  function open({ focus = null } = {}) {
    returnFocusTo = document.activeElement;
    isOpen = true;
    overlay.classList.remove('hidden');

    const target = focus || focusableWithin(overlay)[0];
    target?.focus();
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    overlay.classList.add('hidden');

    returnFocusTo?.focus?.();
    returnFocusTo = null;
    onClose();
  }

  document.addEventListener('keydown', onKeyDown);

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });

  return { open, close, isOpen: () => isOpen };
}
