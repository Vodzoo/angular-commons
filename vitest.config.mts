import angular from '@analogjs/vite-plugin-angular';
import {defineConfig} from 'vitest/config';

export default defineConfig({
  plugins: [angular({
    jit: true,
    tsconfig: 'projects/ngx-vodzoo-forms-commons/tsconfig.spec.json',
  })],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['projects/ngx-vodzoo-forms-commons/src/**/*.spec.ts'],
    setupFiles: ['projects/ngx-vodzoo-forms-commons/src/test-setup.ts'],
    restoreMocks: true,
  },
});
