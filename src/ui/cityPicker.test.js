// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCityPicker } from './cityPicker.js';

const CITIES = [
  { name: 'Bratislava', country: 'Slovakia' },
  { name: 'Brasília', country: 'Brazil' },
  { name: 'Braunschweig', country: 'Germany' }
];

let picker = null;
let search = null;
let onPick = null;
let onClear = null;
let selection = null;

const input = () => document.querySelector('#cityInput');
const results = () => document.querySelector('#cityResults');
const options = () => [...document.querySelectorAll('.city-result')];
const activeOption = () => document.querySelector('.city-result-active');
const isOpen = () => !results().classList.contains('hidden');

const describe_ = (city) => `${city.name}, ${city.country}`;

function mount({ debounceMs = 0, found = CITIES } = {}) {
  search = vi.fn(async () => found);
  onPick = vi.fn((city) => {
    selection = city;
  });
  onClear = vi.fn(() => {
    selection = null;
  });

  picker = createCityPicker({
    input: input(),
    results: results(),
    search,
    describeResult: describe_,
    describeSelection: describe_,
    getSelection: () => selection,
    onPick,
    onClear,
    debounceMs
  });
}

// Types into the field and lets the debounced search resolve.
async function type(value) {
  input().value = value;
  input().dispatchEvent(new Event('input'));
  await new Promise((resolve) => setTimeout(resolve, 1));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function press(key) {
  const event = new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true });
  input().dispatchEvent(event);
  return event;
}

beforeEach(() => {
  selection = null;
  document.body.innerHTML = `
    <div class="city-picker">
      <input id="cityInput" />
      <div id="cityResults" class="city-results hidden"></div>
    </div>
    <button id="elsewhere">elsewhere</button>
  `;
});

afterEach(() => picker?.destroy());

describe('searching', () => {
  beforeEach(() => mount());

  it('waits for a second character before asking', async () => {
    await type('B');
    expect(search).not.toHaveBeenCalled();
    expect(isOpen()).toBe(false);
  });

  it('renders one option per result', async () => {
    await type('Bra');
    expect(options()).toHaveLength(3);
    expect(options()[0].textContent).toBe('Bratislava, Slovakia');
  });

  it('says so when nothing matches', async () => {
    picker.destroy();
    mount({ found: [] });
    await type('Zzzz');
    expect(document.querySelector('.city-result-empty').textContent).toBe('No cities found.');
  });

  it('reports a failed lookup instead of failing silently', async () => {
    picker.destroy();
    search = vi.fn(async () => {
      throw new Error('offline');
    });
    picker = createCityPicker({
      input: input(),
      results: results(),
      search,
      describeResult: describe_,
      describeSelection: describe_,
      onPick: () => {},
      onClear: () => {},
      debounceMs: 0
    });

    await type('Bra');
    expect(document.querySelector('.city-result-empty').textContent).toMatch(/unavailable/);
  });

  it('closes again when the query is cut back down', async () => {
    await type('Bra');
    expect(isOpen()).toBe(true);
    await type('B');
    expect(isOpen()).toBe(false);
  });

  it('escapes a hostile city name rather than injecting it', async () => {
    picker.destroy();
    mount({ found: [{ name: '<img src=x onerror=alert(1)>', country: 'X' }] });
    await type('Bra');
    expect(results().querySelectorAll('img')).toHaveLength(0);
  });

  it('ignores a slow earlier response that lands after a newer one', async () => {
    picker.destroy();

    const slow = [{ name: 'Stale', country: 'Old' }];
    search = vi.fn((query) =>
      query === 'slow'
        ? new Promise((resolve) => setTimeout(() => resolve(slow), 40))
        : Promise.resolve(CITIES)
    );

    picker = createCityPicker({
      input: input(),
      results: results(),
      search,
      describeResult: describe_,
      describeSelection: describe_,
      onPick: () => {},
      onClear: () => {},
      debounceMs: 0
    });

    await type('slow');
    await type('fast');
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(options().map((option) => option.textContent)).not.toContain('Stale, Old');
  });
});

describe('keyboard', () => {
  beforeEach(async () => {
    mount();
    await type('Bra');
  });

  it('highlights nothing until a key is pressed', () => {
    // Enter on an unmatched query must not silently commit whatever sorted
    // first — the wrong city is worse than no city.
    expect(activeOption()).toBeNull();
    expect(input().getAttribute('aria-activedescendant')).toBeNull();
  });

  it('walks down the list', () => {
    press('ArrowDown');
    expect(activeOption().textContent).toBe('Bratislava, Slovakia');
    press('ArrowDown');
    expect(activeOption().textContent).toBe('Brasília, Brazil');
  });

  it('wraps around at the bottom', () => {
    press('ArrowDown');
    press('ArrowDown');
    press('ArrowDown');
    press('ArrowDown');
    expect(activeOption().textContent).toBe('Bratislava, Slovakia');
  });

  it('goes straight to the last option on the first ArrowUp', () => {
    press('ArrowUp');
    expect(activeOption().textContent).toBe('Braunschweig, Germany');
  });

  it('jumps to the ends with Home and End', () => {
    press('End');
    expect(activeOption().textContent).toBe('Braunschweig, Germany');
    press('Home');
    expect(activeOption().textContent).toBe('Bratislava, Slovakia');
  });

  it('commits the highlighted option on Enter', () => {
    press('ArrowDown');
    press('ArrowDown');
    press('Enter');

    expect(onPick).toHaveBeenCalledWith(CITIES[1]);
    expect(input().value).toBe('Brasília, Brazil');
    expect(isOpen()).toBe(false);
  });

  it('lets Enter through when nothing is highlighted', () => {
    // Otherwise the picker would swallow a form submit it has no business
    // intercepting.
    const event = press('Enter');
    expect(event.defaultPrevented).toBe(false);
    expect(onPick).not.toHaveBeenCalled();
  });

  it('claims the arrow keys so the caret does not move instead', () => {
    expect(press('ArrowDown').defaultPrevented).toBe(true);
  });

  it('leaves the arrow keys alone when the list is shut', () => {
    press('Escape');
    expect(press('ArrowDown').defaultPrevented).toBe(false);
  });

  it('closes on Escape without picking anything', () => {
    press('ArrowDown');
    press('Escape');
    expect(isOpen()).toBe(false);
    expect(onPick).not.toHaveBeenCalled();
  });

  it('abandons the list on Tab rather than committing from it', () => {
    press('ArrowDown');
    press('Tab');
    expect(isOpen()).toBe(false);
    expect(onPick).not.toHaveBeenCalled();
  });

  it('does not swallow Escape when there is nothing open', () => {
    press('Escape');
    expect(press('Escape').defaultPrevented).toBe(false);
  });
});

describe('screen reader wiring', () => {
  beforeEach(() => mount());

  it('announces itself as a combobox tied to the list', () => {
    expect(input().getAttribute('role')).toBe('combobox');
    expect(input().getAttribute('aria-controls')).toBe('cityResults');
    expect(input().getAttribute('aria-autocomplete')).toBe('list');
    expect(results().getAttribute('role')).toBe('listbox');
  });

  it('reports whether the list is open', async () => {
    expect(input().getAttribute('aria-expanded')).toBe('false');
    await type('Bra');
    expect(input().getAttribute('aria-expanded')).toBe('true');
    press('Escape');
    expect(input().getAttribute('aria-expanded')).toBe('false');
  });

  it('points at the highlighted option by id', async () => {
    await type('Bra');
    press('ArrowDown');

    const active = activeOption();
    expect(active.id).toBe('cityResults-option-0');
    expect(input().getAttribute('aria-activedescendant')).toBe(active.id);
  });

  it('marks exactly one option selected', async () => {
    await type('Bra');
    press('ArrowDown');
    expect(options().filter((o) => o.getAttribute('aria-selected') === 'true')).toHaveLength(1);
  });

  it('stops pointing at an option once the list closes', async () => {
    await type('Bra');
    press('ArrowDown');
    press('Escape');
    expect(input().getAttribute('aria-activedescendant')).toBeNull();
  });
});

describe('mouse', () => {
  beforeEach(async () => {
    mount();
    await type('Bra');
  });

  it('commits a clicked option', () => {
    options()[2].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onPick).toHaveBeenCalledWith(CITIES[2]);
  });

  it('moves the highlight to follow the pointer', () => {
    press('ArrowDown');
    options()[2].dispatchEvent(new MouseEvent('pointermove', { bubbles: true }));
    // One highlight, not two competing ones.
    expect(activeOption().textContent).toBe('Braunschweig, Germany');
    expect(document.querySelectorAll('.city-result-active')).toHaveLength(1);
  });

  it('closes when something outside is pressed', () => {
    document
      .querySelector('#elsewhere')
      .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(isOpen()).toBe(false);
  });

  it('stays open when the list itself is pressed', () => {
    options()[0].dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(isOpen()).toBe(true);
  });
});

describe('an existing selection', () => {
  it('is dropped as soon as the field is edited away from it', async () => {
    mount();
    await type('Bra');
    press('ArrowDown');
    press('Enter');
    expect(selection).toEqual(CITIES[0]);

    await type('Bratislav');
    // A half-typed city must not keep the previous coordinates.
    expect(onClear).toHaveBeenCalled();
    expect(selection).toBeNull();
  });

  it('survives re-typing the exact same city', async () => {
    mount();
    await type('Bra');
    press('Enter');
    press('ArrowDown');
    press('Enter');

    onClear.mockClear();
    await type('Bratislava, Slovakia');
    expect(onClear).not.toHaveBeenCalled();
  });
});

describe('destroy', () => {
  it('releases the document listener so a re-render cannot stack them', async () => {
    mount();
    await type('Bra');
    picker.destroy();

    // With the listener still attached this would throw or mutate a detached
    // node; the point is that a stale picker goes quiet.
    document.body.innerHTML = '<button id="elsewhere">gone</button>';
    expect(() =>
      document
        .querySelector('#elsewhere')
        .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    ).not.toThrow();
  });

  it('cancels a search still waiting to fire', async () => {
    mount({ debounceMs: 30 });
    input().value = 'Bra';
    input().dispatchEvent(new Event('input'));
    picker.destroy();

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(search).not.toHaveBeenCalled();
  });
});

describe('a missing picker', () => {
  it('returns a harmless object rather than throwing', () => {
    const none = createCityPicker({ input: null, results: null });
    expect(() => none.destroy()).not.toThrow();
  });
});
