import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4390/crypto-lab-lattice-gentle/',
    colorScheme: 'dark',
  },
  webServer: {
    command: 'npm run preview -- --port 4390 --strictPort',
    url: 'http://localhost:4390/crypto-lab-lattice-gentle/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
