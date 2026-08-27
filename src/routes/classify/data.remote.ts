import { error } from '@sveltejs/kit';
import { form, query } from '$app/server';
import {
	getValidationCandidate,
	recordHumanClassification,
	recordValidation
} from '$lib/server/genlexis';
import { ANY_PATTERN, type PatternFilter } from './filter';
import { parseClassification, parseVote, toRepoFilter, type ClassifyRefusal } from './params';

export const candidate = query('unchecked', (filter: PatternFilter = ANY_PATTERN) =>
	getValidationCandidate(toRepoFilter(filter))
);

/** The named refusals of `params.ts`, on the wire. */
const REFUSAL_MESSAGES: Record<ClassifyRefusal, string> = {
	invalid_sentence_id: 'Invalid sentence id',
	missing_appropriate: 'Missing appropriate verdict',
	missing_grammatical: 'Missing grammatical verdict',
	missing_semantics: 'Missing semantics verdict'
};

const vote = async (data: Record<string, unknown>, isCorrect: boolean) => {
	const parsed = parseVote(data);
	if (!parsed.ok) error(400, REFUSAL_MESSAGES[parsed.reason]);

	await recordValidation(parsed.value.sentenceId, isCorrect);
	await candidate(parsed.value.filter).refresh();
};

export const correct = form('unchecked', (data: Record<string, unknown>) => vote(data, true));
export const incorrect = form('unchecked', (data: Record<string, unknown>) => vote(data, false));

export const classify = form('unchecked', async (data: Record<string, unknown>) => {
	const parsed = parseClassification(data);
	if (!parsed.ok) error(400, REFUSAL_MESSAGES[parsed.reason]);

	const { sentenceId, appropriate, grammatical, semantics, filter } = parsed.value;
	await recordHumanClassification(sentenceId, { appropriate, grammatical, semantics });
	await candidate(filter).refresh();
});
