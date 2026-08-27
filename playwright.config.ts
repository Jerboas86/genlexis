import { defineConfig } from '@playwright/test';

export default defineConfig({
	webServer: {
		command: 'pnpm exec vite build && pnpm exec vite preview --port 4173',
		env: {
			CI: '1',
			WRANGLER_SEND_METRICS: 'false'
		},
		port: 4173,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000
	},
	/*
		One worker, because every spec in this suite shares one database.

		Two problems disappear together. The fixtures are namespaced per worker but
		the queries are not — "nouns of two syllables" matches every worker's nouns,
		so a parallel run made the generation assertions depend on how the suite
		happened to be sharded. And the classification specs undo their votes by
		deleting every row written since a high-water mark, which would take a
		concurrent worker's seed rows with it.

		Both could be fixed while keeping parallelism — by scoping each assertion
		and each delete more narrowly — but the suite runs in well under a minute,
		so serialising is the cheaper guarantee and the one that stays true as specs
		are added.
	*/
	workers: 1,
	testMatch: '**/*.e2e.{ts,js}'
});
