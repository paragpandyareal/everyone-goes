import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({ test: { include: ['lib/**/*.test.ts'] }, resolve: { alias: { '@': import.meta.dirname } } });
