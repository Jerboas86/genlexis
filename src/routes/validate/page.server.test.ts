import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isRedirect } from '@sveltejs/kit';
import { actions, load } from './+page.server';
import { getValidationCandidate, recordValidation } from '$lib/server/genlexis';

vi.mock('$lib/server/genlexis', () => ({
	getValidationCandidate: vi.fn(),
	recordValidation: vi.fn()
}));

const mockedGetValidationCandidate = vi.mocked(getValidationCandidate);
const mockedRecordValidation = vi.mocked(recordValidation);

const formRequest = (sentenceId: string) => {
	const formData = new FormData();
	formData.set('sentenceId', sentenceId);

	return new Request('https://genlexis.test/validate', { method: 'POST', body: formData });
};

describe('/validate server route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('loads a candidate sentence', async () => {
		expect.assertions(1);

		const candidate = {
			sentenceId: 1,
			sentence: 'Le chat dort.',
			pattern: 'det noun verb',
			voteCount: 0,
			correctCount: 0,
			incorrectCount: 0,
			validationStatus: 'unreviewed' as const
		};
		mockedGetValidationCandidate.mockResolvedValueOnce(candidate);

		await expect(load({} as never)).resolves.toEqual({ candidate });
	});

	it('loads an empty state when no candidate needs validation', async () => {
		expect.assertions(1);

		mockedGetValidationCandidate.mockResolvedValueOnce(null);

		await expect(load({} as never)).resolves.toEqual({ candidate: null });
	});

	it('records a correct vote and redirects back to the next candidate', async () => {
		expect.assertions(3);

		mockedRecordValidation.mockResolvedValueOnce(undefined);

		try {
			await actions.correct?.({ request: formRequest('42') } as never);
		} catch (error) {
			expect(isRedirect(error)).toBe(true);
			if (isRedirect(error)) {
				expect(error.location).toBe('/validate');
			}
		}

		expect(mockedRecordValidation).toHaveBeenCalledWith(42, true);
	});

	it('records an incorrect vote and redirects back to the next candidate', async () => {
		expect.assertions(3);

		mockedRecordValidation.mockResolvedValueOnce(undefined);

		try {
			await actions.incorrect?.({ request: formRequest('43') } as never);
		} catch (error) {
			expect(isRedirect(error)).toBe(true);
			if (isRedirect(error)) {
				expect(error.location).toBe('/validate');
			}
		}

		expect(mockedRecordValidation).toHaveBeenCalledWith(43, false);
	});
});
