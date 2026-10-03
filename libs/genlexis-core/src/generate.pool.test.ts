import { describe, expect, it, vi } from 'vitest';
import {
	describePool,
	type FindPoolOptions,
	type GenerationRepository,
	type PoolEntry,
	type PoolRepository
} from './generate.js';

const DISTRIBUTION = { a: 0.4, ʃ: 0.2, t: 0.2, o: 0.2 };

const entry = (sentenceId: number, dedupeKey: string, phonoIpas: string[]): PoolEntry => ({
	sentenceId,
	sentence: `Phrase ${sentenceId}`,
	pattern: 'np_verb',
	dedupeKey,
	phonoIpas,
	tokens: [
		{ position: 1, slot: 'det', surface: 'le', lexical: null },
		{ position: 2, slot: 'noun', surface: 'chat', lexical: null }
	]
});

const repositoryOf = (
	entries: PoolEntry[],
	distribution: Record<string, number> = DISTRIBUTION
): GenerationRepository & PoolRepository => ({
	countAcceptedSentences: vi.fn(async () => entries.length),
	findRandomAcceptedItems: vi.fn(async () => []),
	findAcceptedItemsWithIpa: vi.fn(async () => []),
	getPhonemeDistribution: vi.fn(async () => distribution),
	findPoolEntries: vi.fn<(options: FindPoolOptions) => Promise<PoolEntry[]>>(async () => entries)
});

const FILTERS = {
	language: 'fr-FR',
	pattern: 'np_verb' as const,
	lexicalDensity: 'medium' as const
};

describe('describePool', () => {
	it('keeps every variant of a pair, which a draw would reduce to one', async () => {
		const entries = [
			entry(1, 'chat dort', ['ʃa']),
			entry(2, 'chat dort', ['ʃa']),
			entry(3, 'rat', ['ta'])
		];

		const pool = await describePool(FILTERS, repositoryOf(entries));

		expect(pool.map((item) => item.sentenceId)).toEqual([1, 2, 3]);
	});

	it('drops a sentence whose transcriptions yield no phoneme, as a draw does', async () => {
		const entries = [entry(1, 'chat', ['ʃa']), entry(2, 'xyz', ['ɣɣ'])];

		const pool = await describePool(FILTERS, repositoryOf(entries));

		expect(pool.map((item) => item.sentenceId)).toEqual([1]);
	});

	it('asks the repository for the filters it was given, and nothing that selects from them', async () => {
		const repository = repositoryOf([]);

		await describePool({ ...FILTERS, gender: 'f' }, repository);

		expect(repository.findPoolEntries).toHaveBeenCalledWith({ ...FILTERS, gender: 'f' });
	});

	it('refuses a language without a phoneme distribution, with the draw message', async () => {
		await expect(describePool(FILTERS, repositoryOf([], {}))).rejects.toThrow(
			'No phoneme distribution found for language "fr-FR"'
		);
	});
});
