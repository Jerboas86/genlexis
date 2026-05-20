import { describe, expect, it, vi } from 'vitest';
import {
	generateBalancedAcceptedSentences,
	type AcceptedItemWithIpa,
	type FindAcceptedItemsWithIpaOptions,
	type GenlexisRepository
} from './genlexis';

vi.mock('$lib/server/db', () => ({
	db: { execute: vi.fn(), insert: vi.fn(() => ({ values: vi.fn() })) }
}));

vi.mock('$lib/server/db/schema', () => ({ generatedSentenceClassifications: {} }));

const FRENCH_DISTRIBUTION = {
	ʁ: 0.0773809523809523,
	a: 0.0753968253968253,
	l: 0.0615079365079365,
	s: 0.0575396825396825,
	e: 0.0555555555555555,
	ə: 0.0535714285714285,
	t: 0.052579365079365,
	i: 0.052579365079365,
	d: 0.0426587301587301,
	p: 0.0396825396825396,
	k: 0.0396825396825396,
	m: 0.0357142857142857,
	ɔ̃: 0.0337301587301587,
	u: 0.0337301587301587,
	n: 0.0297619047619047,
	v: 0.0267857142857142,
	ɔ: 0.0248015873015873,
	y: 0.0228174603174603,
	o: 0.0208333333333333,
	ɛ: 0.0188492063492063,
	j: 0.0178571428571428,
	ʒ: 0.0148809523809523,
	z: 0.0148809523809523,
	f: 0.0138888888888888,
	œ: 0.0128968253968253,
	ø: 0.0119047619047619,
	b: 0.0109126984126984,
	w: 0.0099206349206349,
	ɑ̃: 0.0079365079365078,
	ʃ: 0.0059523809523809,
	g: 0.0059523809523809,
	œ̃: 0.0059523809523809,
	ɛ̃: 0.0049603174603174,
	ɥ: 0.0039682539682539,
	ŋ: 0.0029761904761904
};

const makeRepository = (overrides: Partial<GenlexisRepository>): GenlexisRepository => ({
	findLeastVotedValidationCandidate: vi.fn(async () => null),
	recordValidation: vi.fn(async () => undefined),
	countAcceptedSentences: vi.fn(async () => 0),
	findRandomAcceptedItems: vi.fn(async () => []),
	findAcceptedItemsWithIpa: vi.fn(async () => []),
	getPhonemeDistribution: vi.fn(async () => ({})),
	...overrides
});

const makeItem = (
	sentenceId: number,
	sentence: string,
	phonoIpa: string,
	dedupeKey: string
): AcceptedItemWithIpa => ({
	sentenceId,
	sentence,
	pattern: 'det_noun',
	dedupeKey,
	phonoIpa
});

describe('generateBalancedAcceptedSentences', () => {
	it('rejects unknown languages with a clear error', async () => {
		expect.assertions(1);
		const repository = makeRepository({
			getPhonemeDistribution: vi.fn(async () => ({}))
		});

		await expect(
			generateBalancedAcceptedSentences(
				{ language: 'xx-XX', pattern: 'det_noun', listCount: 1, itemsPerList: 1 },
				repository
			)
		).rejects.toThrow(/xx-XX/);
	});

	it('requests a pool larger than the total requested items', async () => {
		expect.assertions(1);
		const findAcceptedItemsWithIpa: GenlexisRepository['findAcceptedItemsWithIpa'] = vi.fn(
			async () => []
		);
		const repository = makeRepository({
			getPhonemeDistribution: vi.fn(async () => FRENCH_DISTRIBUTION),
			findAcceptedItemsWithIpa
		});

		await generateBalancedAcceptedSentences(
			{ language: 'fr-FR', pattern: 'det_noun', listCount: 2, itemsPerList: 3 },
			repository
		);

		const mock = vi.mocked(findAcceptedItemsWithIpa);
		const call = mock.mock.calls[0][0] satisfies FindAcceptedItemsWithIpaOptions;
		expect(call.poolSize).toBeGreaterThanOrEqual(2 * 3 + 100);
	});

	it('drops words whose IPA contains no in-inventory phonemes', async () => {
		expect.assertions(2);
		const items: AcceptedItemWithIpa[] = [
			makeItem(1, 'Le chat', 'ʃa', 'chat'),
			makeItem(2, 'Le X', 'xx', 'x-noun'),
			makeItem(3, 'Le chien', 'ʃjɛ̃', 'chien')
		];
		const repository = makeRepository({
			getPhonemeDistribution: vi.fn(async () => FRENCH_DISTRIBUTION),
			findAcceptedItemsWithIpa: vi.fn(async () => items)
		});

		const result = await generateBalancedAcceptedSentences(
			{ language: 'fr-FR', pattern: 'det_noun', listCount: 1, itemsPerList: 5 },
			repository
		);

		const surfaces = result.lists.flat().map((entry) => entry.sentence);
		expect(surfaces).not.toContain('Le X');
		expect(result.poolSize).toBe(2);
	});

	it('produces lists, scores, and an aggregate score for a French noun pool', async () => {
		expect.assertions(5);
		const items: AcceptedItemWithIpa[] = [
			makeItem(1, 'Le chat', 'ʃa', 'chat'),
			makeItem(2, 'Le chien', 'ʃjɛ̃', 'chien'),
			makeItem(3, 'La maison', 'mɛzɔ̃', 'maison'),
			makeItem(4, 'La table', 'tabl', 'table'),
			makeItem(5, 'Le livre', 'livʁ', 'livre'),
			makeItem(6, 'Le pain', 'pɛ̃', 'pain'),
			makeItem(7, 'La voiture', 'vwatyʁ', 'voiture'),
			makeItem(8, 'La porte', 'pɔʁt', 'porte')
		];
		const repository = makeRepository({
			getPhonemeDistribution: vi.fn(async () => FRENCH_DISTRIBUTION),
			findAcceptedItemsWithIpa: vi.fn(async () => items)
		});

		const result = await generateBalancedAcceptedSentences(
			{ language: 'fr-FR', pattern: 'det_noun', listCount: 2, itemsPerList: 3 },
			repository
		);

		expect(result.lists).toHaveLength(2);
		expect(result.scores).toHaveLength(2);
		for (const score of result.scores) expect(score).toBeLessThan(2);
		expect(result.aggregateScore).toBeCloseTo(
			result.scores.reduce((a, b) => a + b, 0) / result.scores.length,
			10
		);
	});

	it('keeps words disjoint across lists by default', async () => {
		expect.assertions(1);
		const items: AcceptedItemWithIpa[] = Array.from({ length: 10 }, (_, i) =>
			makeItem(i + 1, `S${i + 1}`, ['ʃa', 'mɛzɔ̃', 'tabl', 'livʁ', 'pɛ̃'][i % 5], `k${i}`)
		);
		const repository = makeRepository({
			getPhonemeDistribution: vi.fn(async () => FRENCH_DISTRIBUTION),
			findAcceptedItemsWithIpa: vi.fn(async () => items)
		});

		const result = await generateBalancedAcceptedSentences(
			{ language: 'fr-FR', pattern: 'det_noun', listCount: 3, itemsPerList: 2 },
			repository
		);

		const flat = result.lists.flat().map((entry) => entry.sentenceId);
		expect(new Set(flat).size).toBe(flat.length);
	});

	it('clamps listCount to [1, 5] like the random generator', async () => {
		expect.assertions(2);
		const repository = makeRepository({
			getPhonemeDistribution: vi.fn(async () => FRENCH_DISTRIBUTION),
			findAcceptedItemsWithIpa: vi.fn(async () => [])
		});

		const above = await generateBalancedAcceptedSentences(
			{ language: 'fr-FR', pattern: 'noun', listCount: 99, itemsPerList: 3 },
			repository
		);
		expect(above.requestedLists).toBe(5);

		const below = await generateBalancedAcceptedSentences(
			{ language: 'fr-FR', pattern: 'noun', listCount: 0, itemsPerList: 3 },
			repository
		);
		expect(below.requestedLists).toBe(1);
	});
});
