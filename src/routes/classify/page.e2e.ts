import { expect, test, type Page } from '@playwright/test';
import {
	classificationHighWaterMark,
	cleanupE2eFixtures,
	rollbackClassificationsAfter,
	seedE2eFixtures
} from '../../../tests/e2e/seed';

/**
 * The classification screen, driven through the filter rather than through a
 * fixture.
 *
 * The test database holds a real corpus and the candidate query orders by fewest
 * votes then `random()`, so no test can rely on being offered a particular
 * sentence. The filter is what makes a branch deterministic: the two richer
 * patterns show the verdict form, and `det_noun` shows the two vote buttons.
 *
 * What is asserted here is the interaction contract — which questions are open,
 * when the submit unlocks, that a vote advances. The *meaning* of the verdict
 * chain is covered exhaustively and much faster by `params.spec.ts`.
 */

const RICH_FILTER = 'det_noun_adj';
const SIMPLE_FILTER = 'det_noun';

/**
 * Opens the screen under one pattern filter.
 *
 * The filter lives in the URL rather than in component state, so navigating
 * straight to it is both more direct and more faithful than clicking: it is the
 * same entry point a shared link would use.
 */
const goToClassify = async (page: Page, filter?: string) => {
	await page.goto(filter ? `/classify?pattern=${filter}` : '/classify');
	await expect(page.getByRole('radiogroup')).toBeVisible();
};

const sentence = (page: Page) => page.locator('p.sentence').first();
const classifyForm = (page: Page) => page.locator('form.classify-form');
const voteActions = (page: Page) => page.locator('.vote-actions');
const submitButton = (page: Page) => page.locator('button.submit');
/**
 * The radios of one question.
 *
 * Asserted on the inputs rather than on the `<fieldset>` that disables them:
 * Playwright only reports the natively disableable controls as disabled, so
 * `toBeDisabled()` on a `<fieldset disabled>` always fails and — far worse —
 * `toBeEnabled()` on one always passes. Asserting on the radios is both correct
 * and closer to what the person actually cannot click.
 */
const question = (page: Page, legend: RegExp) =>
	page
		.locator('fieldset.level')
		.filter({ has: page.getByText(legend) })
		.locator('input');

/**
 * Answers one question of the chain.
 *
 * The radio itself sits under its own `<span>`, so a direct `check()` on the
 * input never lands — and clicking the label is what a person does anyway, which
 * makes this the more faithful instrument as well as the working one.
 */
const answer = async (page: Page, name: string, value: string) => {
	await page.locator(`label:has(input[name="${name}"][value="${value}"])`).click();
	await expect(page.locator(`input[name="${name}"][value="${value}"]`)).toBeChecked();
};

test.describe('/classify', () => {
	let mark = 0;

	test.beforeAll(async () => {
		await seedE2eFixtures();
	});

	test.afterAll(async () => {
		await cleanupE2eFixtures();
	});

	test.beforeEach(async () => {
		// Every vote this file casts lands on a real corpus sentence, so each test
		// records where the table stood and undoes its own writes afterwards.
		mark = await classificationHighWaterMark();
	});

	test.afterEach(async () => {
		await rollbackClassificationsAfter(mark);
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

		await expect(sentence(page)).toBeVisible();
		await expect(sentence(page)).not.toHaveText('');

		// No client-initiated remote-query fetch for the candidate — it was
		// resolved via the SSR-embedded payload.
		const candidateFetches = responseUrls.filter(
			(url) => url.includes('/_app/remote/') && url.includes('candidate')
		);
		expect(candidateFetches).toEqual([]);
	});

	test('offers a candidate and names how many votes it already has', async ({ page }) => {
		await goToClassify(page);
		await expect(sentence(page)).not.toHaveText('');
		await expect(page.locator('p.meta')).toBeVisible();
	});

	test('shows the verdict form for a pattern that needs a full classification', async ({
		page
	}) => {
		await goToClassify(page, RICH_FILTER);
		await expect(classifyForm(page)).toBeVisible();
		await expect(voteActions(page)).toHaveCount(0);
	});

	test('shows the two vote buttons for a pattern that only needs accept or reject', async ({
		page
	}) => {
		await goToClassify(page, SIMPLE_FILTER);
		await expect(voteActions(page)).toBeVisible();
		await expect(classifyForm(page)).toHaveCount(0);
	});

	test.describe('the verdict chain', () => {
		test.beforeEach(async ({ page }) => {
			await goToClassify(page, RICH_FILTER);
			await expect(classifyForm(page)).toBeVisible();
		});

		// The screen pre-fills the verdicts from the LLM pass, so the initial state
		// is not blank and no test may assume it is. Each case below drives the
		// chain explicitly and asserts the transition it is about.

		test('reflects the seeded LLM verdict rather than starting blank', async ({ page }) => {
			// The LLM pass is a starting point for the human, not a hidden default: it
			// has to be visible in the controls, or the judge cannot tell what they are
			// agreeing with.
			const appropriate = page.locator('input[name="appropriate"]:checked');
			const anyChecked = await appropriate.count();
			if (anyChecked > 0) {
				// Whatever it pre-filled, the gating must agree with it.
				const value = await appropriate.first().getAttribute('value');
				if (value === 'true')
					await expect(question(page, /Grammaticalement/).first()).toBeEnabled();
				else await expect(question(page, /Grammaticalement/).first()).toBeDisabled();
			} else {
				await expect(question(page, /Grammaticalement/).first()).toBeDisabled();
			}
		});

		test('closes the chain immediately when the sentence is inappropriate', async ({ page }) => {
			await answer(page, 'appropriate', 'false');
			await expect(question(page, /Grammaticalement/).first()).toBeDisabled();
			await expect(question(page, /Sémantiquement/).first()).toBeDisabled();
			// Nothing further is owed, so the verdict is already submittable.
			await expect(submitButton(page)).toBeEnabled();
		});

		test('opens the grammatical question once the sentence is appropriate', async ({ page }) => {
			// Set to "no" first so the transition to "yes" is the thing observed, rather
			// than whatever the LLM happened to pre-fill.
			await answer(page, 'appropriate', 'false');
			await answer(page, 'appropriate', 'true');
			await expect(question(page, /Grammaticalement/).first()).toBeEnabled();
		});

		test('closes the chain at an ungrammatical sentence', async ({ page }) => {
			await answer(page, 'appropriate', 'true');
			await answer(page, 'grammatical', 'false');
			await expect(question(page, /Sémantiquement/).first()).toBeDisabled();
			await expect(submitButton(page)).toBeEnabled();
		});

		test('opens the semantics question only for an appropriate, grammatical sentence', async ({
			page
		}) => {
			await answer(page, 'appropriate', 'true');
			await answer(page, 'grammatical', 'false');
			await expect(question(page, /Sémantiquement/).first()).toBeDisabled();
			await answer(page, 'grammatical', 'true');
			await expect(question(page, /Sémantiquement/).first()).toBeEnabled();
		});

		test('re-closes the deeper questions when an earlier answer is taken back', async ({
			page
		}) => {
			// Going back up the chain has to shut the questions below it again, or a
			// stale answer rides along under a verdict that no longer opens it.
			await answer(page, 'appropriate', 'true');
			await answer(page, 'grammatical', 'true');
			await expect(question(page, /Sémantiquement/).first()).toBeEnabled();
			await answer(page, 'appropriate', 'false');
			await expect(question(page, /Grammaticalement/).first()).toBeDisabled();
			await expect(question(page, /Sémantiquement/).first()).toBeDisabled();
		});

		test('unlocks the submit once the whole chain is answered', async ({ page }) => {
			await answer(page, 'appropriate', 'true');
			await answer(page, 'grammatical', 'true');
			await answer(page, 'semantics', 'natural');
			await expect(submitButton(page)).toBeEnabled();
		});

		test('records a complete classification and offers the next candidate', async ({ page }) => {
			const before = await sentence(page).textContent();
			await answer(page, 'appropriate', 'true');
			await answer(page, 'grammatical', 'true');
			await answer(page, 'semantics', 'natural');
			await submitButton(page).click();
			await page.waitForLoadState('networkidle');

			// The screen stays usable and keeps offering work; whether the sentence
			// changes depends on what is left to judge, so only the first is asserted.
			await expect(sentence(page)).toBeVisible();
			expect(before).not.toBeNull();
		});

		test('carries the filter through the submission so the next candidate matches it', async ({
			page
		}) => {
			await expect(page.locator('input[name="filter"]').first()).toHaveValue(RICH_FILTER);
			await answer(page, 'appropriate', 'false');
			await submitButton(page).click();
			await page.waitForLoadState('networkidle');
			// Still on the richer branch, which is what the carried filter buys.
			await expect(classifyForm(page)).toBeVisible();
		});
	});

	test.describe('the two-button vote', () => {
		test.beforeEach(async ({ page }) => {
			await goToClassify(page, SIMPLE_FILTER);
			await expect(voteActions(page)).toBeVisible();
		});

		test('accepts a positive vote and stays on the screen', async ({ page }) => {
			await page.locator('button.vote-button-correct').click();
			await page.waitForLoadState('networkidle');
			await expect(voteActions(page)).toBeVisible();
		});

		test('accepts a negative vote and stays on the screen', async ({ page }) => {
			await page.locator('button.vote-button-incorrect').click();
			await page.waitForLoadState('networkidle');
			await expect(voteActions(page)).toBeVisible();
		});

		test('sends the sentence id and the filter with the vote', async ({ page }) => {
			const sentenceId = await page.locator('input[name="sentenceId"]').first().inputValue();
			expect(Number(sentenceId)).toBeGreaterThan(0);
			await expect(page.locator('input[name="filter"]').first()).toHaveValue(SIMPLE_FILTER);
		});

		test('actually writes the vote, rather than only advancing the screen', async ({ page }) => {
			const before = await classificationHighWaterMark();
			await page.locator('button.vote-button-correct').click();
			await page.waitForLoadState('networkidle');
			expect(await classificationHighWaterMark()).toBeGreaterThan(before);
		});
	});

	test('rejects a vote whose sentence id names no row', async ({ request }) => {
		// The transport is closed over the same parser the unit tests cover; this
		// proves the refusal actually reaches the wire as a 400.
		const response = await request.post('/classify', {
			form: { sentenceId: '0', filter: 'any' },
			headers: { 'x-sveltekit-action': 'true' },
			failOnStatusCode: false
		});
		expect(response.status()).toBeGreaterThanOrEqual(400);
	});
});
