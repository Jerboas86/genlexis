import type { BalancedGenerateResult, GenerateOptions, GenerateResult } from '@genlexis/core';
import { SUPPORTED_PATTERNS } from '@genlexis/core';
import {
	generateAcceptedSentences,
	generateBalancedAcceptedSentences
} from '#lib/server/genlexis/index.js';

export type GenerationErrorCode =
	'invalid_request' | 'unsupported_language' | 'insufficient_material' | 'corpus_unavailable';

export class GenerationError extends Error {
	constructor(
		public readonly code: GenerationErrorCode,
		message: string
	) {
		super(message);
	}
}

export type Selection = 'random' | 'phoneme_balanced';
type Filters = Pick<
	GenerateOptions,
	'detType' | 'gender' | 'grammNumber' | 'length' | 'lengthUnit' | 'lexicalDensity'
>;

export type GenerationRequest = {
	selection: Selection;
	language: 'fr-FR';
	pattern: GenerateOptions['pattern'];
	listCount: number;
	itemsPerList: number;
	filters: Filters;
	seed: string;
	allowPartial: boolean;
};

const object = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const closed = (value: Record<string, unknown>, keys: readonly string[]) =>
	Object.keys(value).every((key) => keys.includes(key));

const oneOf = <T extends string>(value: unknown, values: readonly T[]): value is T =>
	typeof value === 'string' && values.includes(value as T);

const optional = <T extends string>(value: unknown, values: readonly T[]): value is T | undefined =>
	value === undefined || oneOf(value, values);

const invalid = (message: string): never => {
	throw new GenerationError('invalid_request', message);
};

function count(value: unknown, maximum: number, name: string): number {
	if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > maximum)
		return invalid(`${name} must be an integer from 1 to ${maximum}`);
	return value as number;
}

function seed(value: unknown, newSeed: () => string): string {
	if (value === undefined) return newSeed();
	if (typeof value !== 'string' || value.length < 1 || value.length > 128 || value.trim() !== value)
		return invalid('seed must be a nonempty string of at most 128 characters without outer spaces');
	return value;
}

function validateFilterValues(filters: Record<string, unknown>): void {
	if (!optional(filters.detType, ['definite', 'indefinite'])) invalid('Invalid detType');
	if (!optional(filters.gender, ['m', 'f'])) invalid('Invalid gender');
	if (!optional(filters.grammNumber, ['s', 'p'])) invalid('Invalid grammNumber');
	if (!optional(filters.lexicalDensity, ['high', 'medium', 'low']))
		invalid('Invalid lexicalDensity');
	if (!optional(filters.lengthUnit, ['syllables', 'phonemes'])) invalid('Invalid lengthUnit');
	if (
		filters.length !== undefined &&
		(!Number.isInteger(filters.length) ||
			(filters.length as number) < 1 ||
			(filters.length as number) > 20)
	)
		invalid('length must be an integer from 1 to 20');
}

function parseFilters(value: unknown, pattern: GenerateOptions['pattern']): Filters {
	const filters = value ?? {};
	if (
		!object(filters) ||
		!closed(filters, ['detType', 'gender', 'grammNumber', 'length', 'lengthUnit', 'lexicalDensity'])
	)
		return invalid('Invalid filters');
	validateFilterValues(filters);
	if (filters.lengthUnit !== undefined && filters.length === undefined)
		return invalid('lengthUnit requires length');
	if (filters.detType !== undefined && pattern === 'noun')
		return invalid('detType requires a pattern with a determiner');
	return {
		detType: filters.detType as Filters['detType'],
		gender: filters.gender as Filters['gender'],
		grammNumber: filters.grammNumber as Filters['grammNumber'],
		length: filters.length as number | undefined,
		lengthUnit:
			filters.length === undefined
				? undefined
				: ((filters.lengthUnit ?? 'syllables') as Filters['lengthUnit']),
		lexicalDensity: filters.lexicalDensity as Filters['lexicalDensity']
	};
}

export function parseGenerationRequest(
	value: unknown,
	newSeed: () => string = () => crypto.randomUUID()
): GenerationRequest {
	if (
		!object(value) ||
		!closed(value, [
			'selection',
			'language',
			'pattern',
			'listCount',
			'itemsPerList',
			'filters',
			'seed',
			'allowPartial'
		])
	)
		return invalid('Expected a JSON object with known fields');
	if (!oneOf(value.selection, ['random', 'phoneme_balanced'])) return invalid('Invalid selection');
	if (value.language !== 'fr-FR') {
		if (typeof value.language === 'string')
			throw new GenerationError('unsupported_language', 'Only fr-FR is supported');
		return invalid('language is required');
	}
	if (!oneOf(value.pattern, SUPPORTED_PATTERNS)) return invalid('Invalid pattern');
	const listCount = count(value.listCount, 5, 'listCount');
	const itemsPerList = count(value.itemsPerList, 50, 'itemsPerList');
	if (value.allowPartial !== undefined && typeof value.allowPartial !== 'boolean')
		return invalid('allowPartial must be a boolean');
	const requestSeed = seed(value.seed, newSeed);
	const filters = parseFilters(value.filters, value.pattern);

	return {
		selection: value.selection,
		language: 'fr-FR',
		pattern: value.pattern,
		listCount,
		itemsPerList,
		filters,
		seed: requestSeed,
		allowPartial: (value.allowPartial as boolean | undefined) ?? false
	};
}

type Generator = (options: GenerateOptions & { language: string }) => Promise<GenerateResult>;
type BalancedGenerator = (
	options: GenerateOptions & { language: string }
) => Promise<BalancedGenerateResult>;

export async function createGeneration(
	request: GenerationRequest,
	dependencies: { random: Generator; balanced: BalancedGenerator } = {
		random: generateAcceptedSentences,
		balanced: generateBalancedAcceptedSentences
	}
) {
	const options = {
		...request.filters,
		pattern: request.pattern,
		listCount: request.listCount,
		itemsPerList: request.itemsPerList,
		seed: request.seed,
		language: request.language
	};
	let generated: GenerateResult | BalancedGenerateResult;
	try {
		generated = await (request.selection === 'random'
			? dependencies.random(options)
			: dependencies.balanced(options));
	} catch (cause) {
		if (cause instanceof Error && cause.message.startsWith('No phoneme distribution'))
			throw new GenerationError('corpus_unavailable', 'Phoneme distribution unavailable');
		throw cause;
	}
	const requestedItems = request.listCount * request.itemsPerList;
	if (
		generated.totalItems === 0 ||
		(generated.totalItems < requestedItems && !request.allowPartial)
	)
		throw new GenerationError(
			'insufficient_material',
			'Not enough accepted sentences match this request'
		);
	return {
		selection: request.selection,
		language: request.language,
		seed: request.seed,
		options: {
			pattern: request.pattern,
			listCount: request.listCount,
			itemsPerList: request.itemsPerList,
			filters: request.filters,
			allowPartial: request.allowPartial
		},
		lists: generated.lists,
		requestedItems,
		totalItems: generated.totalItems,
		complete: generated.totalItems === requestedItems,
		...(request.selection === 'phoneme_balanced'
			? {
					scores: (generated as BalancedGenerateResult).scores,
					aggregateScore: (generated as BalancedGenerateResult).aggregateScore,
					poolSize: (generated as BalancedGenerateResult).poolSize
				}
			: {})
	};
}
