import { expect, test, type Page } from '@playwright/test';
import {
	cleanupE2eFixtures,
	FIXTURE_PHONEME_COUNT,
	NOUN_FP,
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
});
