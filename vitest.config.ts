import { defineConfig } from 'vitest/config'

// Unit tests target the framework-free pure logic in src/domain and the
// matching helpers in src/lib. No jsdom needed — these are plain functions.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
