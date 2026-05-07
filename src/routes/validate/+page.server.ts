import { fail, redirect } from '@sveltejs/kit';
import { getValidationCandidate, recordValidation } from '$lib/server/genlexis';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({
	candidate: await getValidationCandidate()
});

const parseSentenceId = (formData: FormData) => {
	const value = formData.get('sentenceId');
	const sentenceId = typeof value === 'string' ? Number(value) : Number.NaN;

	return Number.isInteger(sentenceId) && sentenceId > 0 ? sentenceId : null;
};

const validate = async (request: Request, isCorrect: boolean) => {
	const sentenceId = parseSentenceId(await request.formData());

	if (!sentenceId) {
		return fail(400, { invalidSentence: true });
	}

	await recordValidation(sentenceId, isCorrect);
	redirect(303, '/validate');
};

export const actions: Actions = {
	correct: async ({ request }) => validate(request, true),
	incorrect: async ({ request }) => validate(request, false)
};
