// The "your city" field, shared by the landing page and the location gate.
//
// Both screens need the identical markup, and both need the same picker wired
// to the same stored location — so the markup lives here once rather than
// being kept in sync by hand in two places.

import { describeLocation, describeSearchResult, searchCities } from '../geo.js';
import { ICONS } from '../icons.js';
import { state, storeMyLocation } from '../store.js';
import { createCityPicker } from '../ui/cityPicker.js';
import { escapeAttr, escapeHtml } from '../ui/html.js';
import { timeInZone } from '../utils.js';

export function cityFieldMarkup({ autofocus = false } = {}) {
  return `
    <label class="field-label" for="cityInput">Your city</label>
    <div class="city-picker">
      <input
        id="cityInput"
        class="text-input"
        placeholder="Start typing a city..."
        autocomplete="off"
        ${autofocus ? 'autofocus' : ''}
        value="${escapeAttr(describeLocation(state.myLocation))}"
      />
      <div id="cityResults" class="city-results hidden"></div>
    </div>
    <p id="cityPreview" class="anniversary-line${state.myLocation ? '' : ' hidden'}">${cityPreviewText()}</p>
  `;
}

// Returns markup, not plain text — it carries drawn icons — so the city name
// (which comes back from a third-party geocoding API) is escaped here rather
// than trusted.
export function cityPreviewText() {
  if (!state.myLocation) return '';
  const now = timeInZone(state.myLocation.timezone);
  const clock = now ? ` — ${now.isNight ? ICONS.moon : ICONS.sun} ${escapeHtml(now.label)} local` : '';
  return `${ICONS.pin} ${escapeHtml(describeLocation(state.myLocation))}${clock}`;
}

// Mounts the autocomplete on whichever screen is currently up. The picker
// itself lives in ui/cityPicker.js and knows nothing about `state`; this is
// the adapter that connects the two.
export function wireCityPicker(onChange = () => {}) {
  const input = document.querySelector('#cityInput');
  const results = document.querySelector('#cityResults');
  const preview = document.querySelector('#cityPreview');
  if (!input || !results) return;

  const refreshPreview = () => {
    // innerHTML: the line carries a drawn pin and sun/moon icon. The city name
    // is escaped inside cityPreviewText() before it gets here.
    preview.innerHTML = cityPreviewText();
    preview.classList.toggle('hidden', !state.myLocation);
    onChange();
  };

  // Both screens that host a picker can be re-rendered (leaving a booth
  // returns to the landing page), and the previous instance is still holding a
  // document-level listener pointed at a DOM that no longer exists.
  state.cityPicker?.destroy();

  state.cityPicker = createCityPicker({
    input,
    results,
    search: searchCities,
    describeResult: describeSearchResult,
    describeSelection: describeLocation,
    getSelection: () => state.myLocation,
    onPick: (picked) => {
      storeMyLocation(picked);
      refreshPreview();
    },
    onClear: () => {
      storeMyLocation(null);
      refreshPreview();
    }
  });
}
