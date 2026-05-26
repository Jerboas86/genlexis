import { expect, test } from '@playwright/test';
import { cleanupE2eFixtures, seedE2eFixtures } from '../../../tests/e2e/seed';

test.describe('/classify', () => {
	test.beforeAll(async () => {
		await seedE2eFixtures();
	});

	test.afterAll(async () => {
		await cleanupE2eFixtures();
	});

	// Guards the contract that the candidate query is awaited at the top of the
	// component so its payload ships with SSR and a candidate sentence appears
	// after hydration without any client-side refetch. Protects the SvelteKit
	// 2.61 migration of the top-level `await query` pattern.
	test('candidate query payload ships in SSR HTML and renders after hydration', async ({
		page,
		request
	}) => {
		const ssr = await (await request.get('/classify')).text();
		// The remote-query payload is inlined into the SSR HTML under a stable key,
		// proving the query was awaited server-side.
		expect(ssr).toContain('/candidate/');

		const responseUrls: string[] = [];
		page.on('response', (r) => responseUrls.push(r.url()));

		await page.goto('/classify');

		const sentence = page.locator('p.sentence').first();
		await expect(sentence).toBeVisible();
		await expect(sentence).not.toHaveText('');

		// No client-initiated remote-query fetch for the candidate — it was
		// resolved via the SSR-embedded payload.
		const candidateFetches = responseUrls.filter(
			(url) => url.includes('/_app/remote/') && url.includes('candidate')
		);
		expect(candidateFetches).toEqual([]);
	});
});
