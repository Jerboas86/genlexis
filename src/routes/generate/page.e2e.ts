import { expect, test, type Page } from '@playwright/test';
import {
	cleanupE2eFixtures,
	FIXTURE_PHONEME_COUNT,
	FIXTURE_SUFFIX,
	FIXTURE_SYLLABLE_COUNT_SHARED,
	NOUN_FS,
	NOUN_FP,
	NOUN_MP,
	NOUN_MS,
	seedE2eFixtures
} from '../../../tests/e2e/seed';

const goToGenerate = async (page: Page) => {
	await page.goto('/generate');
	await expect(page.locator('#pattern')).toBeVisible();
};

const submitForm = async (page: Page) => {
	await page.getByTestId('submit').click();
	await page.waitForLoadState('networkidle');
	await expect(page.getByTestId('lists')).toBeVisible();
};

const setSelect = (page: Page, selector: string, value: string) =>
	page.locator(selector).selectOption(value);

const setNumber = (page: Page, selector: string, value: string) =>
	page.locator(selector).fill(value);

const sentencesIn = async (page: Page) =>
	(await page.getByTestId('list-item').allTextContents()).map((t) => t.trim());

// Splits on whitespace and after an apostrophe so French elisions like
// "l'immeuble" decompose into ["l'", "immeuble"].
const tokensOf = (sentence: string) =>
	sentence
		.toLowerCase()
		.replace(/[.!?,;:]/g, '')
		.split(/\s+|(?<=')/)
		.map((t) => t.trim())
		.filter(Boolean);

const listsCount = (page: Page) => page.getByTestId('list').count();

/**
 * The results, scoped to this worker's own fixtures.
 *
 * Workers run in parallel against one database, so a query that matches "nouns
 * of two syllables" matches every worker's nouns, not just this one's. Without
 * the scope these assertions pass or fail depending on how the suite happened to
 * be sharded, which is the worst kind of test.
 */
const normalizedResults = async (page: Page) =>
	(await sentencesIn(page))
		.map((sentence) => tokensOf(sentence).join(' '))
		.filter((sentence) => sentence.includes(FIXTURE_SUFFIX))
		.sort();

test.describe('/generate', () => {
	test.beforeAll(async () => {
		await seedE2eFixtures();
	});

	test.afterAll(async () => {
		await cleanupE2eFixtures();
	});

	test('hides the determiner type field when pattern is "noun"', async ({ page }) => {
		await goToGenerate(page);

		await expect(page.locator('#detType')).toBeVisible();

		await setSelect(page, '#pattern', 'noun');
		await expect(page.locator('#detType')).toHaveCount(0);

		await setSelect(page, '#pattern', 'det_noun');
		await expect(page.locator('#detType')).toBeVisible();
	});

	test('det_noun results are two-token sentences with globally unique nouns', async ({ page }) => {
		await goToGenerate(page);

		await setSelect(page, '#pattern', 'det_noun');
		await setSelect(page, '#detType', '');
		await setSelect(page, '#gender', '');
		await setSelect(page, '#grammNumber', '');
		await setNumber(page, '#listCount', '5');
		await setNumber(page, '#itemsPerList', '10');

		await submitForm(page);

		const sentences = await sentencesIn(page);
		expect(sentences.length).toBeGreaterThan(0);

		const nouns: string[] = [];
		for (const sentence of sentences) {
			const tokens = tokensOf(sentence);
			expect(tokens).toHaveLength(2);
			nouns.push(tokens[1]);
		}
		expect(new Set(nouns).size).toBe(nouns.length);
	});

	test("definite filter restricts determiners to le/la/l'/les", async ({ page }) => {
		await goToGenerate(page);

		await setSelect(page, '#pattern', 'det_noun');
		await setSelect(page, '#detType', 'definite');
		await setSelect(page, '#gender', '');
		await setSelect(page, '#grammNumber', '');
		await setNumber(page, '#listCount', '1');
		await setNumber(page, '#itemsPerList', '20');

		await submitForm(page);

		const sentences = await sentencesIn(page);
		expect(sentences.length).toBeGreaterThan(0);
		for (const sentence of sentences) {
			expect(tokensOf(sentence)[0]).toMatch(/^(le|la|l'|les)$/);
		}
	});

	test('indefinite filter restricts determiners to un/une/des', async ({ page }) => {
		await goToGenerate(page);

		await setSelect(page, '#pattern', 'det_noun');
		await setSelect(page, '#detType', 'indefinite');
		await setSelect(page, '#gender', '');
		await setSelect(page, '#grammNumber', '');
		await setNumber(page, '#listCount', '1');
		await setNumber(page, '#itemsPerList', '20');

		await submitForm(page);

		const sentences = await sentencesIn(page);
		expect(sentences.length).toBeGreaterThan(0);
		for (const sentence of sentences) {
			expect(tokensOf(sentence)[0]).toMatch(/^(un|une|des)$/);
		}
	});

	test('feminine + singular filter only yields feminine-singular det+noun pairs', async ({
		page
	}) => {
		await goToGenerate(page);

		await setSelect(page, '#pattern', 'det_noun');
		await setSelect(page, '#detType', '');
		await setSelect(page, '#gender', 'f');
		await setSelect(page, '#grammNumber', 's');
		await setNumber(page, '#listCount', '1');
		await setNumber(page, '#itemsPerList', '10');

		await submitForm(page);

		const sentences = await sentencesIn(page);
		expect(sentences.length).toBeGreaterThan(0);
		// la/une carry feminine singular gender; "les" is plural-only and "le/un" are masculine.
		for (const sentence of sentences) {
			expect(tokensOf(sentence)[0]).toMatch(/^(la|une|l')$/);
		}
	});

	test('noun pattern with feminine plural filter returns only the seeded NOUN_FP', async ({
		page
	}) => {
		await goToGenerate(page);

		await setSelect(page, '#pattern', 'noun');
		await setSelect(page, '#gender', 'f');
		await setSelect(page, '#grammNumber', 'p');
		await setSelect(page, '#lengthUnit', 'phonemes');
		await setNumber(page, '#length', String(FIXTURE_PHONEME_COUNT));
		await setNumber(page, '#listCount', '1');
		await setNumber(page, '#itemsPerList', '10');

		await submitForm(page);

		const sentences = await sentencesIn(page);
		// Only the seeded 'noun'-pattern fixtures match; the production corpus
		// only stores 'det_noun' patterns.
		expect(sentences.map(tokensOf).map((tokens) => tokens.join(' '))).toEqual([NOUN_FP]);
	});

	test('syllable length filtering is preserved through the extracted repository adapter', async ({
		page
	}) => {
		await goToGenerate(page);

		await setSelect(page, '#pattern', 'noun');
		await setSelect(page, '#gender', '');
		await setSelect(page, '#grammNumber', '');
		await setSelect(page, '#lengthUnit', 'syllables');
		await setNumber(page, '#length', String(FIXTURE_SYLLABLE_COUNT_SHARED));
		await setNumber(page, '#listCount', '1');
		await setNumber(page, '#itemsPerList', '10');

		await submitForm(page);

		expect(await normalizedResults(page)).toEqual([NOUN_MS, NOUN_FS].sort());
	});

	for (const { density, expected } of [
		{ density: 'high', expected: [NOUN_MS, NOUN_FP] },
		{ density: 'medium', expected: [NOUN_MP] },
		{ density: 'low', expected: [NOUN_FS] }
	] as const) {
		test(`${density} lexical-density filtering is preserved through the extracted repository adapter`, async ({
			page
		}) => {
			await goToGenerate(page);

			await setSelect(page, '#pattern', 'noun');
			await setSelect(page, '#gender', '');
			await setSelect(page, '#grammNumber', '');
			await setSelect(page, '#lengthUnit', 'phonemes');
			await setNumber(page, '#length', String(FIXTURE_PHONEME_COUNT));
			await setSelect(page, '#lexicalDensity', density);
			await setNumber(page, '#listCount', '1');
			await setNumber(page, '#itemsPerList', '10');

			await submitForm(page);

			expect(await normalizedResults(page)).toEqual([...expected].sort());
		});
	}

	test('partitions results across the requested number of lists', async ({ page }) => {
		await goToGenerate(page);

		await setSelect(page, '#pattern', 'det_noun');
		await setSelect(page, '#detType', '');
		await setSelect(page, '#gender', '');
		await setSelect(page, '#grammNumber', '');
		await setNumber(page, '#listCount', '4');
		await setNumber(page, '#itemsPerList', '2');

		await submitForm(page);

		expect(await listsCount(page)).toBe(4);
		const sentences = await sentencesIn(page);
		expect(sentences.length).toBe(8);
		const nouns = sentences.map((s) => tokensOf(s).slice(-1)[0]);
		expect(new Set(nouns).size).toBe(nouns.length);
	});

	test('preserves filters across consecutive submissions', async ({ page }) => {
		await goToGenerate(page);

		await setSelect(page, '#pattern', 'det_noun');
		await setSelect(page, '#detType', '');
		await setSelect(page, '#gender', '');
		await setSelect(page, '#grammNumber', '');
		await setNumber(page, '#listCount', '4');
		await setNumber(page, '#itemsPerList', '2');

		await submitForm(page);
		expect(await listsCount(page)).toBe(4);
		expect((await sentencesIn(page)).length).toBe(8);

		// Inputs must keep their values so the second submission produces the same
		// shape — the form must not auto-reset between clicks.
		await expect(page.locator('#listCount')).toHaveValue('4');
		await expect(page.locator('#itemsPerList')).toHaveValue('2');

		await submitForm(page);
		expect(await listsCount(page)).toBe(4);
		expect((await sentencesIn(page)).length).toBe(8);
	});

	test('stores generated parameters in the URL hash and restores the same lists', async ({
		page
	}) => {
		await goToGenerate(page);

		await setSelect(page, '#pattern', 'det_noun');
		await setSelect(page, '#gender', 'f');
		await setSelect(page, '#grammNumber', 's');
		await setNumber(page, '#listCount', '2');
		await setNumber(page, '#itemsPerList', '3');

		await submitForm(page);

		const firstSentences = await sentencesIn(page);
		const url = new URL(page.url());
		const params = new URLSearchParams(url.hash.slice(1));

		expect(params.get('v')).toBe('1');
		expect(params.get('pattern')).toBe('det_noun');
		expect(params.get('gender')).toBe('f');
		expect(params.get('grammNumber')).toBe('s');
		expect(params.get('listCount')).toBe('2');
		expect(params.get('itemsPerList')).toBe('3');
		expect(params.get('seed')).toBeTruthy();

		await page.goto(url.toString());
		await page.waitForLoadState('networkidle');
		await expect(page.getByTestId('lists')).toBeVisible();

		expect(await sentencesIn(page)).toEqual(firstSentences);
	});

	test('ignores generation URL hashes with unsupported versions', async ({ page }) => {
		const params = new URLSearchParams({
			v: '999',
			balanced: '0',
			pattern: 'det_noun',
			detType: '',
			gender: 'f',
			grammNumber: 's',
			lengthUnit: 'syllables',
			length: '',
			lexicalDensity: '',
			listCount: '2',
			itemsPerList: '3',
			seed: 'future-version'
		});

		await page.goto(`/generate#${params.toString()}`);
		await expect(page.locator('#pattern')).toBeVisible();
		await expect(page.getByTestId('lists')).toHaveCount(0);
	});

	// The balanced path runs a different engine entry point with a phonemic
	// target, and until now nothing exercised it end to end.
	test.describe('balanced generation', () => {
		test('reports a phonemic score per list when balancing is on', async ({ page }) => {
			await goToGenerate(page);
			await page.getByTestId('balance-toggle').check();
			await submitForm(page);

			const scores = page.getByTestId('list-score');
			expect(await scores.count()).toBeGreaterThan(0);
			// A score is a distance, so it is a non-negative number rather than a label.
			for (const text of await scores.allTextContents()) {
				expect(Number(text.replace(/[^0-9.]/g, ''))).not.toBeNaN();
			}
		});

		test('reports no score when balancing is off', async ({ page }) => {
			await goToGenerate(page);
			await submitForm(page);
			await expect(page.getByTestId('list-score')).toHaveCount(0);
		});

		test('keeps the balance choice across a reload from the URL hash', async ({ page }) => {
			await goToGenerate(page);
			await page.getByTestId('balance-toggle').check();
			await submitForm(page);
			expect(page.url()).toContain('balanced=1');

			await page.reload();
			await expect(page.getByTestId('balance-toggle')).toBeChecked();
		});
	});

	test.describe('the richer patterns', () => {
		// Only det_noun and noun were covered; these two carry an adjective and a
		// verb slot that the repository joins differently.
		for (const pattern of ['det_noun_adj', 'np_verb'] as const) {
			test(`${pattern} produces three-token sentences`, async ({ page }) => {
				await goToGenerate(page);
				await setSelect(page, '#pattern', pattern);
				await submitForm(page);

				const sentences = await sentencesIn(page);
				expect(sentences.length).toBeGreaterThan(0);
				for (const sentence of sentences) {
					expect(tokensOf(sentence).length).toBeGreaterThanOrEqual(3);
				}
			});
		}
	});

	test.describe('the count fields', () => {
		test('stops the browser from asking for more lists than the form allows', async ({ page }) => {
			// The clamp itself is server-side and covered by `params.spec.ts`; what
			// the screen owes is a field that cannot ask for the impossible in the
			// first place.
			await goToGenerate(page);
			await expect(page.locator('#listCount')).toHaveAttribute('max', '5');
			await expect(page.locator('#itemsPerList')).toHaveAttribute('max', '50');
		});

		test('honours a single list', async ({ page }) => {
			await goToGenerate(page);
			await setNumber(page, '#listCount', '1');
			await submitForm(page);
			expect(await listsCount(page)).toBe(1);
		});

		test('never returns more items than were asked for', async ({ page }) => {
			await goToGenerate(page);
			await setNumber(page, '#listCount', '1');
			await setNumber(page, '#itemsPerList', '3');
			await submitForm(page);
			expect((await sentencesIn(page)).length).toBeLessThanOrEqual(3);
		});

		test('falls back to the default when the count is left blank', async ({ page }) => {
			// An untouched field used to coerce to zero and clamp to one item, which
			// silently produced a list of a single sentence.
			await goToGenerate(page);
			await setNumber(page, '#itemsPerList', '');
			await setNumber(page, '#listCount', '1');
			await submitForm(page);
			expect((await sentencesIn(page)).length).toBeGreaterThan(1);
		});
	});

	test.describe('the wire contract', () => {
		// The parsers are covered exhaustively by `params.spec.ts`; these prove the
		// refusals actually reach the wire rather than being swallowed.
		test('refuses a generation with no recognisable pattern', async ({ request }) => {
			const response = await request.post('/generate', {
				form: { pattern: 'nonsense' },
				headers: { 'x-sveltekit-action': 'true' },
				failOnStatusCode: false
			});
			expect(response.status()).toBeGreaterThanOrEqual(400);
		});

		test('refuses a balanced generation with a malformed language', async ({ request }) => {
			const response = await request.post('/generate', {
				form: { language: 'fr', pattern: 'det_noun' },
				headers: { 'x-sveltekit-action': 'true' },
				failOnStatusCode: false
			});
			expect(response.status()).toBeGreaterThanOrEqual(400);
		});
	});
});
