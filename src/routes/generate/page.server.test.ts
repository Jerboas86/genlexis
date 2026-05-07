import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
import { generateAcceptedSentences, getAcceptedSentenceCount } from '$lib/server/genlexis';

vi.mock('$lib/server/genlexis', () => ({
	generateAcceptedSentences: vi.fn(),
	getAcceptedSentenceCount: vi.fn()
}));

const mockedGenerateAcceptedSentences = vi.mocked(generateAcceptedSentences);
const mockedGetAcceptedSentenceCount = vi.mocked(getAcceptedSentenceCount);

describe('/generate server route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('loads a disabled state with fewer than 10 accepted sentences', async () => {
		expect.assertions(1);

		mockedGetAcceptedSentenceCount.mockResolvedValueOnce(9);

		await expect(load({} as never)).resolves.toEqual({
			acceptedCount: 9,
			requiredCount: 10,
			canGenerate: false
		});
	});

	it('returns exactly 10 unique accepted sentences when enough exist', async () => {
		expect.assertions(3);

		const sentences = Array.from({ length: 10 }, (_, index) => ({
			sentenceId: index + 1,
			sentence: `Phrase ${index + 1}.`,
			pattern: 'pattern'
		}));
		mockedGenerateAcceptedSentences.mockResolvedValueOnce({
			acceptedCount: 10,
			sentences,
			canGenerate: true
		});

		const result = await actions.default?.({} as never);

		expect(result).toEqual({ sentences });
		expect(result && 'sentences' in result ? result.sentences : []).toHaveLength(10);
		expect(new Set(sentences.map((sentence) => sentence.sentenceId)).size).toBe(10);
	});

	it('re-clicking generate refreshes the list', async () => {
		expect.assertions(3);

		const first = Array.from({ length: 10 }, (_, index) => ({
			sentenceId: index + 1,
			sentence: `Premiere phrase ${index + 1}.`,
			pattern: 'pattern'
		}));
		const second = Array.from({ length: 10 }, (_, index) => ({
			sentenceId: index + 21,
			sentence: `Deuxieme phrase ${index + 1}.`,
			pattern: 'pattern'
		}));
		mockedGenerateAcceptedSentences
			.mockResolvedValueOnce({ acceptedCount: 20, sentences: first, canGenerate: true })
			.mockResolvedValueOnce({ acceptedCount: 20, sentences: second, canGenerate: true });

		const firstResult = await actions.default?.({} as never);
		const secondResult = await actions.default?.({} as never);

		expect(mockedGenerateAcceptedSentences).toHaveBeenCalledTimes(2);
		expect(firstResult).toEqual({ sentences: first });
		expect(secondResult).toEqual({ sentences: second });
	});
});
