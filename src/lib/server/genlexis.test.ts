import { describe, expect, it, vi } from 'vitest';
import {
	generateAcceptedSentences,
	getValidationCandidate,
	recordValidation,
	type AcceptedItem,
	type FindAcceptedItemsOptions,
	type GenlexisRepository
} from './genlexis';

vi.mock('$lib/server/db', () => ({
	db: {
		execute: vi.fn(),
		insert: vi.fn(() => ({ values: vi.fn() }))
	}
}));

vi.mock('$lib/server/db/schema', () => ({
	generatedSentenceValidations: {}
}));

const makeRepository = (overrides: Partial<GenlexisRepository>): GenlexisRepository => ({
	findRandomValidationCandidate: vi.fn(async () => null),
	recordValidation: vi.fn(async () => undefined),
	countAcceptedSentences: vi.fn(async () => 0),
	findRandomAcceptedItems: vi.fn(async () => []),
	findAcceptedItemsWithIpa: vi.fn(async () => []),
	getPhonemeDistribution: vi.fn(async () => ({})),
	...overrides
});

describe('genlexis server helpers', () => {
	it('selects an unreviewed validation candidate before needs_more_votes', async () => {
		expect.assertions(3);

		const candidate = {
			sentenceId: 1,
			sentence: 'Le chat dort.',
			pattern: 'det noun verb',
			voteCount: 0,
			correctCount: 0,
			incorrectCount: 0,
			validationStatus: 'unreviewed' as const
		};
		const repository = makeRepository({
			findRandomValidationCandidate: vi.fn(async (status) =>
				status === 'unreviewed' ? candidate : null
			)
		});

		await expect(getValidationCandidate(repository)).resolves.toEqual(candidate);
		expect(repository.findRandomValidationCandidate).toHaveBeenCalledWith('unreviewed');
		expect(repository.findRandomValidationCandidate).not.toHaveBeenCalledWith('needs_more_votes');
	});

	it('falls back to a sentence that needs more votes', async () => {
		expect.assertions(2);

		const candidate = {
			sentenceId: 2,
			sentence: 'La maison tombe.',
			pattern: 'det noun verb',
			voteCount: 1,
			correctCount: 1,
			incorrectCount: 0,
			validationStatus: 'needs_more_votes' as const
		};
		const repository = makeRepository({
			findRandomValidationCandidate: vi.fn(async (status) =>
				status === 'needs_more_votes' ? candidate : null
			)
		});

		await expect(getValidationCandidate(repository)).resolves.toEqual(candidate);
		expect(repository.findRandomValidationCandidate).toHaveBeenNthCalledWith(2, 'needs_more_votes');
	});

	it('records a validation vote', async () => {
		expect.assertions(1);

		const repository = makeRepository({});

		await recordValidation(42, false, repository);

		expect(repository.recordValidation).toHaveBeenCalledWith(42, false);
	});

	it('forwards filter options to the repository and partitions results into N lists', async () => {
		expect.assertions(3);

		const items: AcceptedItem[] = Array.from({ length: 6 }, (_, i) => ({
			sentenceId: i + 1,
			sentence: `S${i + 1}`,
			pattern: 'det_noun',
			dedupeKey: `n${i + 1}`
		}));
		const findRandomAcceptedItems = vi.fn(async () => items);
		const repository = makeRepository({ findRandomAcceptedItems });

		const result = await generateAcceptedSentences(
			{
				pattern: 'det_noun',
				detType: 'definite',
				gender: 'f',
				grammNumber: 'p',
				listCount: 3,
				itemsPerList: 2
			},
			repository
		);

		expect(findRandomAcceptedItems).toHaveBeenCalledWith({
			pattern: 'det_noun',
			detType: 'definite',
			gender: 'f',
			grammNumber: 'p',
			lengthUnit: undefined,
			length: undefined,
			lexicalDensity: undefined,
			limit: 6
		} satisfies FindAcceptedItemsOptions);
		expect(result.lists).toHaveLength(3);
		expect(result.lists.map((list) => list.length)).toEqual([2, 2, 2]);
	});

	it('enforces global noun uniqueness across all lists', async () => {
		expect.assertions(2);

		const items: AcceptedItem[] = [
			{ sentenceId: 1, sentence: 'Le chat', pattern: 'det_noun', dedupeKey: 'chat' },
			{ sentenceId: 2, sentence: 'Un chat', pattern: 'det_noun', dedupeKey: 'chat' },
			{ sentenceId: 3, sentence: 'Le chien', pattern: 'det_noun', dedupeKey: 'chien' },
			{ sentenceId: 4, sentence: 'La maison', pattern: 'det_noun', dedupeKey: 'maison' }
		];
		const repository = makeRepository({ findRandomAcceptedItems: vi.fn(async () => items) });

		const result = await generateAcceptedSentences(
			{ pattern: 'det_noun', listCount: 2, itemsPerList: 2 },
			repository
		);

		const flat = result.lists.flat();
		expect(flat).toHaveLength(3);
		expect(new Set(flat.map(({ sentence }) => sentence.split(' ').slice(-1)[0])).size).toBe(3);
	});

	it('best-effort partitions when fewer items match than requested', async () => {
		expect.assertions(2);

		const items: AcceptedItem[] = [
			{ sentenceId: 1, sentence: 'Le chat', pattern: 'det_noun', dedupeKey: 'chat' },
			{ sentenceId: 2, sentence: 'Le chien', pattern: 'det_noun', dedupeKey: 'chien' }
		];
		const repository = makeRepository({ findRandomAcceptedItems: vi.fn(async () => items) });

		const result = await generateAcceptedSentences(
			{ pattern: 'det_noun', listCount: 5, itemsPerList: 5 },
			repository
		);

		expect(result.totalItems).toBe(2);
		expect(result.lists.map((list) => list.length)).toEqual([1, 1, 0, 0, 0]);
	});

	it('clamps listCount to the [1, 5] range', async () => {
		expect.assertions(2);

		const findRandomAcceptedItems = vi.fn(async () => []);
		const repository = makeRepository({ findRandomAcceptedItems });

		const above = await generateAcceptedSentences(
			{ pattern: 'noun', listCount: 99, itemsPerList: 3 },
			repository
		);
		expect(above.requestedLists).toBe(5);

		const below = await generateAcceptedSentences(
			{ pattern: 'noun', listCount: 0, itemsPerList: 3 },
			repository
		);
		expect(below.requestedLists).toBe(1);
	});
});
