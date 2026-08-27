/**
 * Reading a classification request.
 *
 * Separated from `data.remote.ts` for the same reason as the generation half: a
 * SvelteKit `form()` is not callable, so rules defined inside one can only be
 * reached through a browser and a live database.
 *
 * The verdicts here are a **chain**, not three independent fields, and that is
 * the part worth testing exhaustively: a sentence judged inappropriate is never
 * asked whether it is grammatical, and one judged ungrammatical is never asked
 * about its semantics. Recording an answer to a question that was never put is
 * how a corpus acquires votes nobody cast.
 */

// Straight from the engine rather than through `$lib/server/genlexis`. That
// barrel exists to inject a repository, and pulling it in here would open a
// database connection at import time for the sake of one pure function.
import { parseSupportedPattern, type SemanticsLabel } from '@genlexis/core';
import { ANY_PATTERN, type PatternFilter } from './filter';

export const SEMANTICS_LABELS: readonly SemanticsLabel[] = [
	'natural',
	'plausible',
	'strained',
	'nonsensical'
];

/**
 * The filter as the repository wants it: `undefined` means "any pattern".
 *
 * The sentinel is a UI value and stops here; nothing below this line should
 * have to know that "any" was spelled `'any'`.
 */
export const toRepoFilter = (value: unknown) =>
	value === ANY_PATTERN || value === undefined ? undefined : parseSupportedPattern(value);

/**
 * The pattern filter carried through a vote so the next candidate matches it.
 *
 * An unknown value falls back to `ANY_PATTERN` rather than refusing: the filter
 * only decides which sentence is offered next, so a bad one costs nothing and
 * failing the vote over it would lose a verdict the person did cast.
 */
export const parseFilter = (value: unknown): PatternFilter =>
	value === 'det_noun' || value === 'det_noun_adj' || value === 'np_verb' ? value : ANY_PATTERN;

/** A positive integer sentence id, or `null`. */
export const parseSentenceId = (value: unknown): number | null => {
	const sentenceId = typeof value === 'string' ? Number(value) : Number.NaN;

	return Number.isInteger(sentenceId) && sentenceId > 0 ? sentenceId : null;
};

/**
 * A tri-state boolean from a form field.
 *
 * `null` is "not answered", which is distinct from `false`. Only the two exact
 * strings count: a checkbox that submits `'on'` has not answered this question.
 */
export const parseBoolean = (value: unknown): boolean | null => {
	if (value === 'true') return true;
	if (value === 'false') return false;
	return null;
};

export const parseSemantics = (value: unknown): SemanticsLabel | null => {
	if (typeof value !== 'string') return null;
	return (SEMANTICS_LABELS as readonly string[]).includes(value) ? (value as SemanticsLabel) : null;
};

/** A human verdict, with the questions that were never asked left `null`. */
export interface ClassificationParams {
	sentenceId: number;
	appropriate: boolean;
	grammatical: boolean | null;
	semantics: SemanticsLabel | null;
	filter: PatternFilter;
}

export type ClassifyRefusal =
	| 'invalid_sentence_id'
	| 'missing_appropriate'
	| 'missing_grammatical'
	| 'missing_semantics';

export type ClassifyResult =
	| { ok: true; value: ClassificationParams }
	| { ok: false; reason: ClassifyRefusal };

/**
 * Reads a full classification, enforcing the order the questions are put in.
 *
 * Each answer is required only when the one before it opened the question:
 * `grammatical` matters only if the sentence is appropriate, `semantics` only
 * if it is also grammatical. Downstream they are `null`, which records that the
 * question was closed rather than answered negatively.
 */
export function parseClassification(data: Record<string, unknown>): ClassifyResult {
	const sentenceId = parseSentenceId(data.sentenceId);
	if (sentenceId === null) return { ok: false, reason: 'invalid_sentence_id' };

	const appropriate = parseBoolean(data.appropriate);
	if (appropriate === null) return { ok: false, reason: 'missing_appropriate' };

	const grammatical = appropriate ? parseBoolean(data.grammatical) : null;
	if (appropriate && grammatical === null) return { ok: false, reason: 'missing_grammatical' };

	const semantics = appropriate && grammatical ? parseSemantics(data.semantics) : null;
	if (appropriate && grammatical && semantics === null)
		return { ok: false, reason: 'missing_semantics' };

	return {
		ok: true,
		value: { sentenceId, appropriate, grammatical, semantics, filter: parseFilter(data.filter) }
	};
}

export type VoteResult =
	| { ok: true; value: { sentenceId: number; filter: PatternFilter } }
	| { ok: false; reason: 'invalid_sentence_id' };

/** Reads a plain correct/incorrect vote, which carries no verdict chain. */
export function parseVote(data: Record<string, unknown>): VoteResult {
	const sentenceId = parseSentenceId(data.sentenceId);
	if (sentenceId === null) return { ok: false, reason: 'invalid_sentence_id' };
	return { ok: true, value: { sentenceId, filter: parseFilter(data.filter) } };
}
