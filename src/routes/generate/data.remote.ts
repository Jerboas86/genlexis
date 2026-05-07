import { form, query } from '$app/server';
import { generateAcceptedSentences, getAcceptedSentenceCount } from '$lib/server/genlexis';

const REQUIRED_SENTENCE_COUNT = 10;

export const acceptedSummary = query(async () => {
	const acceptedCount = await getAcceptedSentenceCount();

	return {
		acceptedCount,
		requiredCount: REQUIRED_SENTENCE_COUNT,
		canGenerate: acceptedCount >= REQUIRED_SENTENCE_COUNT
	};
});

export const generate = form(async () => {
	const result = await generateAcceptedSentences(undefined, REQUIRED_SENTENCE_COUNT);

	if (!result.canGenerate) {
		return {
			acceptedCount: result.acceptedCount,
			requiredCount: REQUIRED_SENTENCE_COUNT,
			notEnoughAccepted: true as const,
			sentences: []
		};
	}

	return { sentences: result.sentences };
});
