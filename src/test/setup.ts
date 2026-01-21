import '@testing-library/jest-dom';

// Mock crypto.randomUUID for tests
if (typeof crypto === 'undefined') {
  // @ts-expect-error - polyfill for Node environment
  global.crypto = {
    randomUUID: () => Math.random().toString(36).substring(2) + Date.now().toString(36),
  };
}
