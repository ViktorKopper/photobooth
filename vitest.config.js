import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Most of the suite is pure logic and runs fastest with no DOM at all.
    // Files that genuinely need one opt in per-file with a
    // `@vitest-environment happy-dom` docblock, so the cost is paid only
    // where it buys something.
    environment: 'node',
    setupFiles: ['./src/test-setup.js'],
    include: ['src/**/*.test.js']
  }
});
