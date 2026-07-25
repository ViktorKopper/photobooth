import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Node rather than jsdom: everything under test here is pure logic —
    // maths, dates, colour matrices, storage bookkeeping — so pulling in a
    // whole DOM implementation would only slow the suite down. The one
    // browser API any of it touches is localStorage, stubbed in setup.
    environment: 'node',
    setupFiles: ['./src/test-setup.js'],
    include: ['src/**/*.test.js']
  }
});
