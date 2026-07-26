// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import {
  buildKeepsakeGallery,
  buildMilestoneLine,
  buildSegmented,
  buildSharedCollageBlock,
  buildStreakLine,
  buildThumbRow,
  formatDays,
  togetherLine,
  weatherChip
} from './parts.js';

// Parsing the markup instead of string-matching it: these builders exist to
// produce a DOM, and asserting on the DOM is what actually proves they do.
const dom = (html) => {
  const host = document.createElement('div');
  host.innerHTML = html;
  return host;
};

const photo = (owner, index, extra = {}) => ({
  owner,
  index,
  downloadUrl: `https://example.test/${owner}-${index}.jpg`,
  reactions: { viktor: false, jericka: false },
  ...extra
});

describe('formatDays', () => {
  it('says day rather than days for one', () => {
    expect(formatDays(1)).toBe('1 day');
    expect(formatDays(2)).toBe('2 days');
  });
});

describe('togetherLine', () => {
  it('is empty without a date to count from', () => {
    expect(togetherLine('')).toBe('');
    expect(togetherLine('not-a-date')).toBe('');
  });

  it('carries a drawn icon, not an emoji', () => {
    const html = togetherLine('2026-01-13');
    expect(dom(html).querySelector('svg')).not.toBeNull();
  });
});

describe('buildMilestoneLine', () => {
  const START = '2026-01-13';
  // START + n days, so each case pins an exact day count.
  const onDay = (n) => new Date(2026, 0, 13 + (n - 1), 12);

  it('stays quiet when the next landmark is far off', () => {
    // Day 2 — the next hundred is 98 days away.
    expect(buildMilestoneLine(START, { referenceDate: onDay(2) })).toBe('');
  });

  it('nudges once the landmark is close', () => {
    const html = buildMilestoneLine(START, { referenceDate: onDay(192) });
    expect(dom(html).textContent).toContain('8 days to day 200');
  });

  it('celebrates the day itself with the stronger styling', () => {
    const html = buildMilestoneLine(START, { referenceDate: onDay(200) });
    const node = dom(html).querySelector('p');
    expect(node.classList.contains('milestone-reached')).toBe(true);
    expect(node.textContent).toContain('200 days together');
  });

  it('prefers the anniversary wording on the year itself', () => {
    const html = buildMilestoneLine(START, { referenceDate: onDay(365) });
    expect(dom(html).textContent).toContain('One year together');
  });

  it('says day rather than days when only one is left', () => {
    expect(dom(buildMilestoneLine(START, { referenceDate: onDay(199) })).textContent).toContain(
      '1 day to'
    );
  });

  it('respects a tighter nudge window', () => {
    expect(buildMilestoneLine(START, { referenceDate: onDay(192), nudgeWithin: 5 })).toBe('');
  });

  it('is empty when there is no valid date', () => {
    expect(buildMilestoneLine('')).toBe('');
  });
});

describe('buildStreakLine', () => {
  const day = (offset) => ({ roomId: `R${offset}`, at: Date.now() - offset * 86400000 });

  it('says nothing for a single day — that is not a streak', () => {
    expect(buildStreakLine([day(0)])).toBe('');
    expect(buildStreakLine([])).toBe('');
  });

  it('reports two or more consecutive days', () => {
    const html = buildStreakLine([day(0), day(1), day(2)]);
    expect(dom(html).textContent).toContain('3 days in a row');
  });
});

describe('buildKeepsakeGallery', () => {
  const keepsake = (id) => ({ roomId: id, url: `https://example.test/${id}.png` });

  it('is empty when there is nothing to show', () => {
    expect(buildKeepsakeGallery([])).toBe('');
    expect(buildKeepsakeGallery(null)).toBe('');
  });

  it('renders one tile per collage, newest-first order preserved', () => {
    const html = buildKeepsakeGallery([keepsake('AAA'), keepsake('BBB')]);
    const links = dom(html).querySelectorAll('a.keepsake');
    expect(links).toHaveLength(2);
    expect(links[0].getAttribute('href')).toContain('AAA');
  });

  it('caps how many it draws', () => {
    const many = Array.from({ length: 30 }, (_, i) => keepsake(`R${i}`));
    expect(dom(buildKeepsakeGallery(many)).querySelectorAll('a.keepsake')).toHaveLength(12);
  });

  it('opens externally without leaking the referrer', () => {
    const link = dom(buildKeepsakeGallery([keepsake('AAA')])).querySelector('a.keepsake');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('escapes a hostile room id instead of injecting it', () => {
    const html = buildKeepsakeGallery([{ roomId: '"><img src=x onerror=alert(1)>', url: 'u' }]);
    expect(dom(html).querySelectorAll('img')).toHaveLength(1);
  });
});

describe('buildSegmented', () => {
  const options = [
    { value: 'grid', label: 'Grid' },
    { value: 'strip', label: 'Strip' }
  ];

  it('marks exactly the selected option active', () => {
    const buttons = dom(buildSegmented('Layout', 'collageLayout', options, 'strip')).querySelectorAll(
      '.segmented-option'
    );
    expect([...buttons].filter((b) => b.classList.contains('active'))).toHaveLength(1);
    expect(dom(buildSegmented('Layout', 'k', options, 'strip')).querySelector('.active').dataset.value).toBe(
      'strip'
    );
  });

  it('marks nothing active when the selection matches no option', () => {
    const html = buildSegmented('Layout', 'k', options, 'nonsense');
    expect(dom(html).querySelector('.active')).toBeNull();
  });

  it('labels the group for assistive tech', () => {
    const group = dom(buildSegmented('Layout', 'k', options, 'grid')).querySelector('[role="group"]');
    expect(group.getAttribute('aria-label')).toBe('Layout');
  });
});

describe('weatherChip', () => {
  it('is empty without a reading', () => {
    expect(weatherChip(null)).toBe('');
  });

  it('shows the temperature with a drawn icon', () => {
    const html = weatherChip({ temperature: 18, code: 61, label: 'rain' });
    const node = dom(html);
    expect(node.textContent).toContain('18°');
    expect(node.querySelector('svg')).not.toBeNull();
  });

  it('handles a sub-zero reading', () => {
    expect(dom(weatherChip({ temperature: -5, code: 71, label: 'snow' })).textContent).toContain('-5°');
  });
});

describe('buildSharedCollageBlock', () => {
  const collage = (extra = {}) => ({
    downloadUrl: 'https://example.test/c.png',
    savedBy: 'viktor',
    layout: 'grid',
    theme: 'notebook',
    format: 'original',
    ...extra
  });

  it('is empty until someone saves one', () => {
    expect(buildSharedCollageBlock(null, 'viktor')).toBe('');
    expect(buildSharedCollageBlock({}, 'viktor')).toBe('');
  });

  it('addresses the person who saved it differently from the one who did not', () => {
    expect(dom(buildSharedCollageBlock(collage(), 'viktor')).textContent).toContain('You saved this');
    expect(dom(buildSharedCollageBlock(collage(), 'jericka')).textContent).toContain('Viktor saved this');
  });

  it('leaves the default format out of the summary', () => {
    const text = dom(buildSharedCollageBlock(collage(), 'viktor')).textContent;
    expect(text).toContain('grid');
    expect(text).not.toContain('original');
  });
});

describe('buildThumbRow', () => {
  const row = (opts) => dom(buildThumbRow(opts));

  const own = {
    role: 'viktor',
    viewerRole: 'viktor',
    photos: [photo('viktor', 1), photo('viktor', 2), photo('viktor', 3)]
  };

  it('always renders three slots', () => {
    expect(row({ ...own, photos: [] }).querySelectorAll('.thumb-slot')).toHaveLength(3);
    expect(row(own).querySelectorAll('.thumb-slot')).toHaveLength(3);
  });

  it('marks empty slots as empty and filled ones as filled', () => {
    const partial = row({ ...own, photos: [photo('viktor', 2)] });
    expect(partial.querySelectorAll('.thumb-slot.filled')).toHaveLength(1);
    expect(partial.querySelectorAll('.thumb-slot.empty')).toHaveLength(2);
  });

  it('gives the owner edit and retake controls', () => {
    const mine = row(own);
    expect(mine.querySelectorAll('.thumb-edit-btn')).toHaveLength(3);
    expect(mine.querySelectorAll('.thumb-retake-btn')).toHaveLength(3);
  });

  it("withholds those controls on the partner's photos", () => {
    const theirs = row({
      role: 'jericka',
      viewerRole: 'viktor',
      photos: [photo('jericka', 1), photo('jericka', 2), photo('jericka', 3)]
    });
    expect(theirs.querySelectorAll('.thumb-edit-btn')).toHaveLength(0);
    expect(theirs.querySelectorAll('.thumb-retake-btn')).toHaveLength(0);
    expect(theirs.querySelectorAll('.thumb-move-btn')).toHaveLength(0);
    // ...but reacting stays available: it's the viewer's own expression.
    expect(theirs.querySelectorAll('.thumb-reaction-btn')).toHaveLength(3);
  });

  it('only offers an arrow where there is a filled neighbour to swap with', () => {
    const middleOnly = row({ ...own, photos: [photo('viktor', 2)] });
    expect(middleOnly.querySelectorAll('.thumb-move-btn')).toHaveLength(0);

    const pair = row({ ...own, photos: [photo('viktor', 1), photo('viktor', 2)] });
    // Slot 1 can move right, slot 2 can move left. Nothing points at the gap.
    expect(pair.querySelectorAll('.thumb-move-left')).toHaveLength(1);
    expect(pair.querySelectorAll('.thumb-move-right')).toHaveLength(1);
  });

  it('points each arrow at the right pair of slots', () => {
    const right = row(own).querySelector('.thumb-slot .thumb-move-right');
    expect(right.dataset.from).toBe('1');
    expect(right.dataset.to).toBe('2');
  });

  it('shows a filled heart once the viewer has reacted', () => {
    const liked = row({ ...own, photos: [photo('viktor', 1, { reactions: { viktor: true } })] });
    expect(liked.querySelector('.thumb-reaction-btn').classList.contains('reacted')).toBe(true);
  });

  it("badges a photo the partner has reacted to", () => {
    const loved = row({ ...own, photos: [photo('viktor', 1, { reactions: { jericka: true } })] });
    expect(loved.querySelector('.thumb-partner-heart')).not.toBeNull();
    // The viewer's own button stays un-pressed.
    expect(loved.querySelector('.thumb-reaction-btn').classList.contains('reacted')).toBe(false);
  });

  it('highlights the slot being retaken', () => {
    const mid = row({ ...own, replacingIndex: 2 });
    const slots = mid.querySelectorAll('.thumb-slot');
    expect(slots[1].classList.contains('replacing')).toBe(true);
    expect(slots[0].classList.contains('replacing')).toBe(false);
  });

  it('escapes a hostile download url rather than breaking out of the tag', () => {
    const nasty = row({
      ...own,
      photos: [photo('viktor', 1, { downloadUrl: '"><script>alert(1)</script>' })]
    });
    expect(nasty.querySelector('script')).toBeNull();
  });

  it('ignores photos belonging to the other person', () => {
    const mixed = row({ ...own, photos: [photo('viktor', 1), photo('jericka', 2), photo('jericka', 3)] });
    expect(mixed.querySelectorAll('.thumb-slot.filled')).toHaveLength(1);
  });
});
