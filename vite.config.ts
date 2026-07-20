/// <reference types="vitest/config" />
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/crypto-lab-lattice-gentle/',
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
