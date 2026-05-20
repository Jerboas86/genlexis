import { error } from '@sveltejs/kit';
import { form, query } from '$app/server';
import {
	getValidationCandidate,
	parseSupportedPattern,
	recordHumanClassification,
	recordValidation,
	type SemanticsLabel
} from '$lib/server/genlexis';
import { ANY_PATTERN, type PatternFilter } from './filter';

const toRepoFilter = (value: unknown) =>
	value === ANY_PATTERN || value === undefined ? undefined : parseSupportedPattern(value);

export const candidate = query('unchecked', (filter: PatternFilter = ANY_PATTERN) =>
	getValidationCandidate(toRepoFilter(filter))
);

const parseSentenceId = (value: unknown) => {
	const sentenceId = typeof value === 'string' ? Number(value) : Number.NaN;

	return Number.isInteger(sentenceId) && sentenceId > 0 ? sentenceId : null;
};

const parseFilter = (value: unknown): PatternFilter =>
	value === 'det_noun' || value === 'det_noun_adj' ? value : ANY_PATTERN;

const vote = async (data: Record<string, unknown>, isCorrect: boolean) => {
	const sentenceId = parseSentenceId(data.sentenceId);

	if (!sentenceId) {
		error(400, 'Invalid sentence id');
	}

	const filter = parseFilter(data.filter);

	await recordValidation(sentenceId, isCorrect);
	await candidate(filter).refresh();
};

export const correct = form('unchecked', (data: Record<string, unknown>) => vote(data, true));
export const incorrect = form('unchecked', (data: Record<string, unknown>) => vote(data, false));

const SEMANTICS_LABELS: readonly SemanticsLabel[] = [
	'natural',
	'plausible',
	'strained',
	'nonsensical'
];

const parseBoolean = (value: unknown): boolean | null => {
	if (value === 'true') return true;
	if (value === 'false') return false;
	return null;
};

const parseSemantics = (value: unknown): SemanticsLabel | null => {
	if (typeof value !== 'string') return null;
	return (SEMANTICS_LABELS as readonly string[]).includes(value) ? (value as SemanticsLabel) : null;
};

export const classify = form('unchecked', async (data: Record<string, unknown>) => {
	const sentenceId = parseSentenceId(data.sentenceId);
	if (!sentenceId) {
		error(400, 'Invalid sentence id');
	}

	const appropriate = parseBoolean(data.appropriate);
	if (appropriate === null) {
		error(400, 'Missing appropriate verdict');
	}

	const grammatical = appropriate ? parseBoolean(data.grammatical) : null;
	if (appropriate && grammatical === null) {
		error(400, 'Missing grammatical verdict');
	}

	const semantics = appropriate && grammatical ? parseSemantics(data.semantics) : null;
	if (appropriate && grammatical && semantics === null) {
		error(400, 'Missing semantics verdict');
	}

	const filter = parseFilter(data.filter);

	await recordHumanClassification(sentenceId, { appropriate, grammatical, semantics });
	await candidate(filter).refresh();
});
