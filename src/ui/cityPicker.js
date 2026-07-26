// The city autocomplete.
//
// This was the last part of the app that could not be operated without a
// mouse: results appeared, but the only way to choose one was to click it.
// Anyone on a physical keyboard, or using a screen reader, reached a dead
// end at the one field the app refuses to let you skip.
//
// Implemented as the ARIA combobox pattern, where focus never leaves the
// input and `aria-activedescendant` points at the highlighted option. The
// alternative — moving real focus into the list — fights the input on
// mobile, because shifting focus away closes the on-screen keyboard and the
// list underneath it jumps.
//
// Everything it talks to is injected, so the search never has to be real.

const ACTIVE_CLASS = 'city-result-active';

export function createCityPicker({
  input,
  results,
  search,
  describeResult,
  describeSelection,
  onPick,
  onClear,
  getSelection = () => null,
  debounceMs = 300
}) {
  if (!input || !results) return { destroy() {} };

  let items = [];
  let activeIndex = -1;
  let debounce = null;
  // Monotonic, so a slow earlier request can never overwrite the results of
  // a newer keystroke.
  let token = 0;

  const listId = results.id || 'cityResults';
  results.id = listId;
  results.setAttribute('role', 'listbox');

  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', listId);
  input.setAttribute('aria-autocomplete', 'list');

  const isOpen = () => !results.classList.contains('hidden');

  function close() {
    results.classList.add('hidden');
    results.innerHTML = '';
    items = [];
    activeIndex = -1;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }

  function openWith(html) {
    results.classList.remove('hidden');
    results.innerHTML = html;
    input.setAttribute('aria-expanded', 'true');
  }

  function optionId(index) {
    return `${listId}-option-${index}`;
  }

  // Announces the highlight and keeps it in view. Nothing here moves focus:
  // in a combobox the input keeps it, and the pointer is virtual.
  function setActive(index) {
    activeIndex = index;
    const options = [...results.querySelectorAll('.city-result')];

    options.forEach((option, at) => {
      const active = at === index;
      option.classList.toggle(ACTIVE_CLASS, active);
      option.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    if (index < 0) {
      input.removeAttribute('aria-activedescendant');
      return;
    }

    input.setAttribute('aria-activedescendant', optionId(index));
    options[index]?.scrollIntoView?.({ block: 'nearest' });
  }

  function commit(index) {
    const picked = items[index];
    if (!picked) return false;

    input.value = describeSelection(picked);
    close();
    onPick(picked);
    return true;
  }

  function renderOptions(found) {
    items = found;

    openWith(
      found
        .map(
          (item, index) =>
            `<div role="option" id="${optionId(index)}" class="city-result" data-index="${index}" aria-selected="false">${escapeText(describeResult(item))}</div>`
        )
        .join('')
    );

    // Nothing is preselected. Pressing Enter on a query the app hasn't
    // matched yet should not silently commit whatever happened to sort
    // first — the wrong city is worse than no city.
    setActive(-1);
  }

  function renderMessage(text) {
    items = [];
    activeIndex = -1;
    openWith(`<div class="city-result-empty">${escapeText(text)}</div>`);
    input.removeAttribute('aria-activedescendant');
  }

  const onInput = () => {
    const query = input.value.trim();
    const selection = getSelection();

    // Typing again after picking invalidates the stored pick until a new
    // suggestion is chosen — otherwise a half-typed city would silently keep
    // the previous coordinates.
    if (selection && query !== describeSelection(selection)) onClear();

    window.clearTimeout(debounce);

    if (query.length < 2) {
      close();
      return;
    }

    debounce = window.setTimeout(async () => {
      const mine = ++token;
      renderMessage('Searching...');

      try {
        const found = await search(query);
        if (mine !== token) return;
        if (!found.length) {
          renderMessage('No cities found.');
          return;
        }
        renderOptions(found);
      } catch {
        if (mine !== token) return;
        renderMessage('City lookup unavailable right now.');
      }
    }, debounceMs);
  };

  const onKeyDown = (event) => {
    // Escape closes the list even when it is empty, and is the one key that
    // should work whether or not there are results.
    if (event.key === 'Escape') {
      if (isOpen()) {
        event.preventDefault();
        close();
      }
      return;
    }

    if (event.key === 'Tab') {
      // Leaving the field abandons the list rather than committing from it.
      close();
      return;
    }

    if (!isOpen() || !items.length) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActive(activeIndex + 1 >= items.length ? 0 : activeIndex + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActive(activeIndex <= 0 ? items.length - 1 : activeIndex - 1);
        break;
      case 'Home':
        event.preventDefault();
        setActive(0);
        break;
      case 'End':
        event.preventDefault();
        setActive(items.length - 1);
        break;
      case 'Enter':
        // Only swallowed when it actually does something, so Enter on an
        // unhighlighted query still submits the surrounding form.
        if (activeIndex >= 0) {
          event.preventDefault();
          commit(activeIndex);
        }
        break;
      default:
        break;
    }
  };

  const onClick = (event) => {
    const option = event.target.closest('.city-result');
    if (!option) return;
    commit(Number(option.dataset.index));
  };

  const onPointerMove = (event) => {
    const option = event.target.closest('.city-result');
    if (!option) return;
    // Keeps the keyboard highlight and the mouse from disagreeing about
    // which row is current.
    setActive(Number(option.dataset.index));
  };

  const onDocumentPointerDown = (event) => {
    if (!input.contains(event.target) && !results.contains(event.target)) close();
  };

  input.addEventListener('input', onInput);
  input.addEventListener('keydown', onKeyDown);
  results.addEventListener('click', onClick);
  results.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerdown', onDocumentPointerDown);

  return {
    // Screens re-render (leaving a booth returns to the landing page), so the
    // document-level listener has to be detachable. Without this every visit
    // would stack another one holding a stale DOM reference.
    destroy() {
      window.clearTimeout(debounce);
      document.removeEventListener('pointerdown', onDocumentPointerDown);
    }
  };
}

// The option label carries a city name from a third-party geocoding API, and
// goes in through innerHTML.
function escapeText(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
