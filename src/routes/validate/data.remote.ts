import { error } from '@sveltejs/kit';
import { form, query } from '$app/server';
import { getValidationCandidate, recordValidation } from '$lib/server/genlexis';

export const candidate = query(() => getValidationCandidate());

const parseSentenceId = (value: unknown) => {
	const sentenceId = typeof value === 'string' ? Number(value) : Number.NaN;

	return Number.isInteger(sentenceId) && sentenceId > 0 ? sentenceId : null;
};

const vote = async (data: Record<string, unknown>, isCorrect: boolean) => {
	const sentenceId = parseSentenceId(data.sentenceId);

	if (!sentenceId) {
		error(400, 'Invalid sentence id');
	}

	await recordValidation(sentenceId, isCorrect);
	await candidate().refresh();
};

export const correct = form('unchecked', (data: Record<string, unknown>) => vote(data, true));
export const incorrect = form('unchecked', (data: Record<string, unknown>) => vote(data, false));
