/**
 * Parsing and bounding the generation request.
 *
 * Kept apart from `data.remote.ts` on purpose. A SvelteKit `form()` returns a
 * non-callable object, so anything defined inside one is reachable only by
 * driving a browser against a live database — which is a poor instrument for
 * the boundary cases that make up most of this file. Here the same rules are
 * plain functions over plain values.
 *
 * The separation is not only for tests: the transport should say what a request
 * *is*, and this should say what a request *means*. Every function is total —
 * it returns a value or a named refusal, and never throws — so the caller
 * decides what an invalid field becomes on the wire.
 */

// The value comes from the engine itself, not from `$lib/server/genlexis`: that
// barrel re-exports the repository, whose module graph opens the database on
// import, and a type-only import was the only reason this file never did.
import { SUPPORTED_PATTERNS } from '@genlexis/core';
import type {
	DetType,
	Gender,
	GrammNumber,
	LengthUnit,
	LexicalDensity,
	SupportedPattern
} from '$lib/server/genlexis';

/** How many accepted sentences must exist before generation is offered at all. */
export const REQUIRED_SENTENCE_COUNT = 10;
export const MAX_LISTS = 5;
export const MAX_ITEMS_PER_LIST = 50;
export const MAX_NOUN_LENGTH = 20;
export const MAX_SEED_LENGTH = 128;

// The one list of patterns lives in the engine; this module only validates against it.
export { SUPPORTED_PATTERNS };
export const DET_TYPES: readonly DetType[] = ['definite', 'indefinite'];
const GENDERS: readonly Gender[] = ['m', 'f'];
const GRAMM_NUMBERS: readonly GrammNumber[] = ['s', 'p'];
const LENGTH_UNITS: readonly LengthUnit[] = ['syllables', 'phonemes'];
const LEXICAL_DENSITIES: readonly LexicalDensity[] = ['high', 'medium', 'low'];

/** Whether a pattern has a determiner slot at all. */
export const patternHasDet = (pattern: SupportedPattern): boolean =>
	pattern === 'det_noun' || pattern === 'det_noun_adj' || pattern === 'np_verb';

/**
 * A number, but only from the two things a request can honestly carry one in.
 *
 * `Number()` alone is not safe here: it turns `""`, `null`, `[]` and `true` into
 * integers. The empty string is the one that bit — an untouched count field
 * arrived as `0` and was clamped to the minimum, so a blank "items per list"
 * silently produced one item instead of the documented default of ten.
 */
const toNumber = (value: unknown): number | null => {
	if (typeof value === 'number') return value;
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	if (trimmed === '') return null;
	return Number(trimmed);
};

/**
 * An integer clamped into range, falling back when it is not an integer.
 *
 * Clamping rather than refusing is deliberate for the two count fields: a
 * request for six lists is a request the interface should satisfy with five,
 * not an error. A non-integer is a different thing — it means the field was
 * never filled in properly — and takes the fallback.
 */
export const parseInteger = (
	value: unknown,
	min: number,
	max: number,
	fallback: number
): number => {
	const raw = toNumber(value);
	if (raw === null || !Number.isInteger(raw)) return fallback;
	return Math.max(min, Math.min(max, raw));
};

/**
 * An optional integer, `undefined` when absent or out of range.
 *
 * Out of range is `undefined` rather than clamped, because this one is a
 * *filter*: silently widening "nouns of 40 phonemes" to "nouns of 20" would
 * return a list nobody asked for, where dropping the filter returns a list they
 * can see is unfiltered.
 */
export const parseOptionalInteger = (
	value: unknown,
	min: number,
	max: number
): number | undefined => {
	if (value === undefined || value === null || value === '') return undefined;
	const raw = toNumber(value);
	if (raw === null || !Number.isInteger(raw)) return undefined;
	if (raw < min || raw > max) return undefined;
	return raw;
};

/** One of a closed set, or `undefined`. An empty string is absence, not a value. */
export const parseEnum = <T extends string>(
	value: unknown,
	allowed: readonly T[]
): T | undefined => {
	if (typeof value !== 'string' || value === '') return undefined;
	return (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
};

const LANGUAGE_RE = /^[a-z]{2}-[A-Z]{2}$/;

/**
 * A BCP-47-shaped language tag, in the exact casing the phoneme tables use.
 *
 * Case is not normalised: the distribution is keyed on the published tag, and
 * accepting `fr-fr` here would look up a language the table does not hold.
 */
export const parseLanguage = (value: unknown): string | undefined => {
	if (typeof value !== 'string' || !LANGUAGE_RE.test(value)) return undefined;
	return value;
};

/**
 * The reproducibility seed, trimmed, or `undefined`.
 *
 * An over-long seed is dropped rather than truncated: a truncated seed is a
 * *different* seed, and it would silently produce a different draw from the one
 * the caller asked to reproduce.
 */
export const parseSeed = (value: unknown): string | undefined => {
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	if (trimmed === '') return undefined;
	if (trimmed.length > MAX_SEED_LENGTH) return undefined;
	return trimmed;
};

/** The options the engine takes, once the request has been read. */
export interface GenerationParams {
	pattern: SupportedPattern;
	detType: DetType | undefined;
	gender: Gender | undefined;
	grammNumber: GrammNumber | undefined;
	lengthUnit: LengthUnit | undefined;
	length: number | undefined;
	lexicalDensity: LexicalDensity | undefined;
	listCount: number;
	itemsPerList: number;
	seed: string | undefined;
}

/** Why a request could not be read. The caller maps these onto status codes. */
export type ParamsRefusal = 'invalid_pattern' | 'invalid_language';

export type ParamsResult<T> = { ok: true; value: T } | { ok: false; reason: ParamsRefusal };

/**
 * Reads the shared half of both generation requests.
 *
 * `detType` is dropped for a pattern with no determiner slot rather than
 * refused: the field is still submitted by a form whose select is merely
 * hidden, and honouring it would filter on a slot the pattern does not have.
 *
 * `lengthUnit` is only meaningful beside a `length`. Without one it is dropped,
 * so a unit left at its default does not read as a filter that was applied.
 */
export function parseGenerationParams(
	data: Record<string, unknown>
): ParamsResult<GenerationParams> {
	const pattern = parseEnum<SupportedPattern>(data.pattern, SUPPORTED_PATTERNS);
	if (!pattern) return { ok: false, reason: 'invalid_pattern' };

	const length = parseOptionalInteger(data.length, 1, MAX_NOUN_LENGTH);
	const lengthUnit = parseEnum<LengthUnit>(data.lengthUnit, LENGTH_UNITS) ?? 'syllables';

	return {
		ok: true,
		value: {
			pattern,
			detType: patternHasDet(pattern) ? parseEnum<DetType>(data.detType, DET_TYPES) : undefined,
			gender: parseEnum<Gender>(data.gender, GENDERS),
			grammNumber: parseEnum<GrammNumber>(data.grammNumber, GRAMM_NUMBERS),
			lengthUnit: length !== undefined ? lengthUnit : undefined,
			length,
			lexicalDensity: parseEnum<LexicalDensity>(data.lexicalDensity, LEXICAL_DENSITIES),
			listCount: parseInteger(data.listCount, 1, MAX_LISTS, 1),
			itemsPerList: parseInteger(data.itemsPerList, 1, MAX_ITEMS_PER_LIST, 10),
			seed: parseSeed(data.seed)
		}
	};
}

/** The balanced request: the same options plus the language its target needs. */
export function parseBalancedParams(
	data: Record<string, unknown>
): ParamsResult<GenerationParams & { language: string }> {
	// Language first: it is the only field whose absence the balanced endpoint
	// cannot work around, and refusing on it before anything else keeps the
	// error the caller sees pointed at the field that is actually missing.
	const language = parseLanguage(data.language);
	if (!language) return { ok: false, reason: 'invalid_language' };

	const params = parseGenerationParams(data);
	if (!params.ok) return params;
	return { ok: true, value: { ...params.value, language } };
}
