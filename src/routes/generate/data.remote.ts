import { error } from '@sveltejs/kit';
import { form, query } from '$app/server';
import {
	generateAcceptedSentences,
	generateBalancedAcceptedSentences,
	getAcceptedSentenceCount,
	type BalancedGenerateResult,
	type GenerateResult
} from '$lib/server/genlexis';
import {
	MAX_ITEMS_PER_LIST,
	MAX_LISTS,
	REQUIRED_SENTENCE_COUNT,
	parseBalancedParams,
	parseGenerationParams,
	type ParamsRefusal
} from './params';

export const acceptedSummary = query(async () => {
	const acceptedCount = await getAcceptedSentenceCount();

	return {
		acceptedCount,
		requiredCount: REQUIRED_SENTENCE_COUNT,
		canGenerate: acceptedCount >= REQUIRED_SENTENCE_COUNT,
		maxLists: MAX_LISTS,
		maxItemsPerList: MAX_ITEMS_PER_LIST
	};
});

/** The named refusals of `params.ts`, on the wire. */
const REFUSAL_MESSAGES: Record<ParamsRefusal, string> = {
	invalid_pattern: 'Invalid pattern',
	invalid_language: 'Invalid language'
};

export const generate = form(
	'unchecked',
	async (data: Record<string, unknown>): Promise<GenerateResult> => {
		const params = parseGenerationParams(data);
		if (!params.ok) error(400, REFUSAL_MESSAGES[params.reason]);

		return generateAcceptedSentences(params.value);
	}
);

export const generateBalanced = form(
	'unchecked',
	async (data: Record<string, unknown>): Promise<BalancedGenerateResult> => {
		const params = parseBalancedParams(data);
		if (!params.ok) error(400, REFUSAL_MESSAGES[params.reason]);

		try {
			return await generateBalancedAcceptedSentences(params.value);
		} catch (err) {
			// A language with no published phoneme distribution is a request this
			// service cannot satisfy, not a fault in it — 422 rather than 500.
			if (err instanceof Error && err.message.startsWith('No phoneme distribution')) {
				error(422, err.message);
			}
			throw err;
		}
	}
);
