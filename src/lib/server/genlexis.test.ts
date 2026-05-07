import { describe, expect, it, vi } from 'vitest';
import {
	generateAcceptedSentences,
	getValidationCandidate,
	recordValidation,
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
	findRandomAcceptedSentences: vi.fn(async () => []),
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
			findRandomValidationCandidate: vi.fn(async (status) => (status === 'unreviewed' ? candidate : null))
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

	it('does not generate until at least 10 accepted sentences exist', async () => {
		expect.assertions(3);

		const repository = makeRepository({ countAcceptedSentences: vi.fn(async () => 9) });

		await expect(generateAcceptedSentences(repository)).resolves.toEqual({
			acceptedCount: 9,
			sentences: [],
			canGenerate: false
		});
		expect(repository.countAcceptedSentences).toHaveBeenCalledOnce();
		expect(repository.findRandomAcceptedSentences).not.toHaveBeenCalled();
	});

	it('returns exactly 10 unique accepted sentences when enough exist', async () => {
		expect.assertions(4);

		const sentences = Array.from({ length: 10 }, (_, index) => ({
			sentenceId: index + 1,
			sentence: `Phrase ${index + 1}.`,
			pattern: 'pattern'
		}));
		const repository = makeRepository({
			countAcceptedSentences: vi.fn(async () => 12),
			findRandomAcceptedSentences: vi.fn(async () => sentences)
		});

		const result = await generateAcceptedSentences(repository);

		expect(result.canGenerate).toBe(true);
		expect(result.sentences).toHaveLength(10);
		expect(new Set(result.sentences.map((sentence) => sentence.sentenceId)).size).toBe(10);
		expect(repository.findRandomAcceptedSentences).toHaveBeenCalledWith(10);
	});
});
