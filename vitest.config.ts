import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['packages/**/*.test.ts', 'apps/**/*.test.ts'], exclude: ['**/node_modules/**', '**/.native-spike/**', '**/.native-game/**'], testTimeout: 15000 } });
