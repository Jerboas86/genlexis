import { defineConfig } from '@playwright/test';

export default defineConfig({
	webServer: {
		command:
			'pnpm exec vite build && pnpm exec wrangler dev .svelte-kit/cloudflare/_worker.js --port 4173',
		env: {
			CI: '1',
			WRANGLER_SEND_METRICS: 'false'
		},
		port: 4173,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000
	},
	testMatch: '**/*.e2e.{ts,js}'
});
