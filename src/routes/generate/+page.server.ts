import { fail } from '@sveltejs/kit';
import { generateAcceptedSentences, getAcceptedSentenceCount } from '$lib/server/genlexis';
import type { Actions, PageServerLoad } from './$types';

const REQUIRED_SENTENCE_COUNT = 10;

export const load: PageServerLoad = async () => {
	const acceptedCount = await getAcceptedSentenceCount();

	return {
		acceptedCount,
		requiredCount: REQUIRED_SENTENCE_COUNT,
		canGenerate: acceptedCount >= REQUIRED_SENTENCE_COUNT
	};
};

export const actions: Actions = {
	default: async () => {
		const result = await generateAcceptedSentences(undefined, REQUIRED_SENTENCE_COUNT);

		if (!result.canGenerate) {
			return fail(400, {
				acceptedCount: result.acceptedCount,
				requiredCount: REQUIRED_SENTENCE_COUNT,
				notEnoughAccepted: true
			});
		}

		return {
			sentences: result.sentences
		};
	}
};
