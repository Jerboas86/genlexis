import { error } from '@sveltejs/kit';
import { form, query } from '$app/server';
import {
	generateAcceptedSentences,
	getAcceptedSentenceCount,
	type DetType,
	type GenerateResult,
	type Gender,
	type GrammNumber,
	type LengthUnit,
	type LexicalDensity,
	type SupportedPattern
} from '$lib/server/genlexis';

const REQUIRED_SENTENCE_COUNT = 10;
const MAX_LISTS = 5;
const MAX_ITEMS_PER_LIST = 50;
const MAX_NOUN_LENGTH = 20;

const SUPPORTED_PATTERNS: SupportedPattern[] = ['det_noun', 'noun'];
const DET_TYPES: DetType[] = ['definite', 'indefinite'];
const GENDERS: Gender[] = ['m', 'f'];
const GRAMM_NUMBERS: GrammNumber[] = ['s', 'p'];
const LENGTH_UNITS: LengthUnit[] = ['syllables', 'phonemes'];
const LEXICAL_DENSITIES: LexicalDensity[] = ['high', 'medium', 'low'];

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

const parseInteger = (value: unknown, min: number, max: number, fallback: number) => {
	const raw = typeof value === 'string' ? Number(value) : Number(value);
	if (!Number.isInteger(raw)) return fallback;
	return Math.max(min, Math.min(max, raw));
};

const parseOptionalInteger = (value: unknown, min: number, max: number): number | undefined => {
	if (value === undefined || value === null || value === '') return undefined;
	const raw = Number(value);
	if (!Number.isInteger(raw)) return undefined;
	if (raw < min || raw > max) return undefined;
	return raw;
};

const parseEnum = <T extends string>(value: unknown, allowed: T[]): T | undefined => {
	if (typeof value !== 'string' || value === '') return undefined;
	return (allowed as string[]).includes(value) ? (value as T) : undefined;
};

export const generate = form(
	'unchecked',
	async (data: Record<string, unknown>): Promise<GenerateResult> => {
		const pattern = parseEnum<SupportedPattern>(data.pattern, SUPPORTED_PATTERNS);
		if (!pattern) error(400, 'Invalid pattern');

		const detType =
			pattern === 'det_noun' ? parseEnum<DetType>(data.detType, DET_TYPES) : undefined;
		const gender = parseEnum<Gender>(data.gender, GENDERS);
		const grammNumber = parseEnum<GrammNumber>(data.grammNumber, GRAMM_NUMBERS);
		const lengthUnit = parseEnum<LengthUnit>(data.lengthUnit, LENGTH_UNITS) ?? 'syllables';
		const length = parseOptionalInteger(data.length, 1, MAX_NOUN_LENGTH);
		const lexicalDensity = parseEnum<LexicalDensity>(data.lexicalDensity, LEXICAL_DENSITIES);
		const listCount = parseInteger(data.listCount, 1, MAX_LISTS, 1);
		const itemsPerList = parseInteger(data.itemsPerList, 1, MAX_ITEMS_PER_LIST, 10);

		return generateAcceptedSentences({
			pattern,
			detType,
			gender,
			grammNumber,
			lengthUnit: length !== undefined ? lengthUnit : undefined,
			length,
			lexicalDensity,
			listCount,
			itemsPerList
		});
	}
);
