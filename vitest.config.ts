import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@engine': path.resolve(__dirname, 'src/engine/index.ts'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
