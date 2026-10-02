import { describe, expect, it, vi } from 'vitest';
import {
	generateUniformAcceptedSentences,
	type AcceptedItemWithIpa,
	type FindAcceptedItemsWithIpaOptions,
	type GenlexisRepository
} from './generate.js';
import { l1Distance } from './phonemes/distance.js';

const DISTRIBUTION = { a: 0.4, ʃ: 0.2, t: 0.2, o: 0.2 };
const SYLLABLES = ['ʃa', 'ta', 'to', 'ʃo', 'ato', 'aʃa'];

const makeItem = (sentenceId: number): AcceptedItemWithIpa => ({
	sentenceId,
	sentence: `Phrase ${sentenceId}`,
	pattern: 'np_verb',
	dedupeKey: `phrase-${sentenceId}`,
	phonoIpas: [SYLLABLES[sentenceId % SYLLABLES.length]]
});

/** A small deterministic hash, standing in for the database's `hashtext` ordering. */
const hash = (text: string): number => {
	let value = 2166136261;
	for (let index = 0; index < text.length; index += 1) {
		value ^= text.charCodeAt(index);
		value = Math.imul(value, 16777619);
	}
	return value >>> 0;
};

/** A repository that returns `count` sentences in the seed's order, as the Drizzle adapter does. */
const repositoryOf = (count: number): GenlexisRepository => ({
	findLeastVotedValidationCandidate: vi.fn(async () => null),
	recordValidation: vi.fn(async () => undefined),
	recordHumanClassification: vi.fn(async () => undefined),
	countAcceptedSentences: vi.fn(async () => count),
	findRandomAcceptedItems: vi.fn(async () => []),
	getPhonemeDistribution: vi.fn(async () => DISTRIBUTION),
	findAcceptedItemsWithIpa: vi.fn(async (options: FindAcceptedItemsWithIpaOptions) =>
		Array.from({ length: count }, (_, index) => makeItem(index + 1)).sort(
			(left, right) =>
				hash(`${options.seed}|${left.sentenceId}`) - hash(`${options.seed}|${right.sentenceId}`)
		)
	)
});

const options = (seed: string, excludedSentenceIds: number[] = []) => ({
	language: 'fr-FR',
	pattern: 'np_verb' as const,
	listCount: 1,
	itemsPerList: 40,
	excludedSentenceIds,
	seed
});

describe('generateUniformAcceptedSentences', () => {
	it('takes the first sentences in the seed order, which is also the presentation order', async () => {
		const repository = repositoryOf(200);
		const pool = await repository.findAcceptedItemsWithIpa({
			language: 'fr-FR',
			pattern: 'np_verb',
			poolSize: 4000,
			seed: 's1'
		});

		const result = await generateUniformAcceptedSentences(options('s1'), repository);

		expect(result.lists[0].map((sentence) => sentence.sentenceId)).toEqual(
			pool.slice(0, 40).map((item) => item.sentenceId)
		);
	});

	it('replays exactly from a seed', async () => {
		const repository = repositoryOf(200);
		const first = await generateUniformAcceptedSentences(options('s2'), repository);
		const second = await generateUniformAcceptedSentences(options('s2'), repository);
		expect(second).toEqual(first);
	});

	it('never returns an excluded sentence', async () => {
		const repository = repositoryOf(200);
		const excluded = (
			await generateUniformAcceptedSentences(options('s3'), repository)
		).lists[0].map((sentence) => sentence.sentenceId);

		const next = await generateUniformAcceptedSentences(options('s3', excluded), repository);

		expect(next.lists[0]).toHaveLength(40);
		for (const sentence of next.lists[0]) expect(excluded).not.toContain(sentence.sentenceId);
	});

	it('reports the phoneme-balance distance of the list it returns', async () => {
		const result = await generateUniformAcceptedSentences(options('s4'), repositoryOf(200));

		expect(result.scores).toHaveLength(1);
		expect(result.scores[0]).toBeGreaterThanOrEqual(0);
		expect(result.aggregateScore).toBe(result.scores[0]);
		// The empty list is the farthest a list can be; any real list is closer.
		expect(result.scores[0]).toBeLessThan(l1Distance(DISTRIBUTION, {}));
	});

	it('returns a short list rather than inventing items when the pool runs out', async () => {
		const result = await generateUniformAcceptedSentences(options('s5'), repositoryOf(25));
		expect(result.lists[0]).toHaveLength(25);
	});

	it('selects every sentence about equally often across seeds', async () => {
		/*
			What the balanced selection cannot do: it returns the sentences that help
			the balance, again and again. Over 2 000 seeds of 40 from 200, each sentence
			is expected 400 times; a χ² on 199 degrees of freedom stays under 264 at the
			1 % level.
		*/
		const repository = repositoryOf(200);
		const counts = new Map<number, number>();
		for (let seed = 0; seed < 2000; seed += 1) {
			const result = await generateUniformAcceptedSentences(options(`seed-${seed}`), repository);
			for (const sentence of result.lists[0]) {
				counts.set(sentence.sentenceId, (counts.get(sentence.sentenceId) ?? 0) + 1);
			}
		}

		const expected = (2000 * 40) / 200;
		let chiSquare = 0;
		for (let id = 1; id <= 200; id += 1) {
			const observed = counts.get(id) ?? 0;
			chiSquare += (observed - expected) ** 2 / expected;
			expect(observed).toBeLessThan(2 * expected);
		}
		expect(chiSquare).toBeLessThan(264);
	});
});
