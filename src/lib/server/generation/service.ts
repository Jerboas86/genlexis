import type { BalancedGenerateResult, GenerateOptions, GenerateResult } from '@genlexis/core';
import { SUPPORTED_PATTERNS } from '@genlexis/core';
import { generateAcceptedSentences, generateBalancedAcceptedSentences } from '$lib/server/genlexis';

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
	if (
		!Number.isInteger(value.listCount) ||
		(value.listCount as number) < 1 ||
		(value.listCount as number) > 5
	)
		return invalid('listCount must be an integer from 1 to 5');
	if (
		!Number.isInteger(value.itemsPerList) ||
		(value.itemsPerList as number) < 1 ||
		(value.itemsPerList as number) > 50
	)
		return invalid('itemsPerList must be an integer from 1 to 50');
	if (value.allowPartial !== undefined && typeof value.allowPartial !== 'boolean')
		return invalid('allowPartial must be a boolean');
	if (
		value.seed !== undefined &&
		(typeof value.seed !== 'string' ||
			value.seed.length < 1 ||
			value.seed.length > 128 ||
			value.seed.trim() !== value.seed)
	)
		return invalid('seed must be a nonempty string of at most 128 characters without outer spaces');
	const rawFilters = value.filters ?? {};
	if (
		!object(rawFilters) ||
		!closed(rawFilters, [
			'detType',
			'gender',
			'grammNumber',
			'length',
			'lengthUnit',
			'lexicalDensity'
		])
	)
		return invalid('Invalid filters');
	if (!optional(rawFilters.detType, ['definite', 'indefinite'])) return invalid('Invalid detType');
	if (!optional(rawFilters.gender, ['m', 'f'])) return invalid('Invalid gender');
	if (!optional(rawFilters.grammNumber, ['s', 'p'])) return invalid('Invalid grammNumber');
	if (!optional(rawFilters.lexicalDensity, ['high', 'medium', 'low']))
		return invalid('Invalid lexicalDensity');
	if (!optional(rawFilters.lengthUnit, ['syllables', 'phonemes']))
		return invalid('Invalid lengthUnit');
	if (
		rawFilters.length !== undefined &&
		(!Number.isInteger(rawFilters.length) ||
			(rawFilters.length as number) < 1 ||
			(rawFilters.length as number) > 20)
	)
		return invalid('length must be an integer from 1 to 20');
	if (rawFilters.lengthUnit !== undefined && rawFilters.length === undefined)
		return invalid('lengthUnit requires length');
	if (rawFilters.detType !== undefined && value.pattern === 'noun')
		return invalid('detType requires a pattern with a determiner');

	return {
		selection: value.selection,
		language: 'fr-FR',
		pattern: value.pattern,
		listCount: value.listCount as number,
		itemsPerList: value.itemsPerList as number,
		filters: {
			detType: rawFilters.detType,
			gender: rawFilters.gender,
			grammNumber: rawFilters.grammNumber,
			length: rawFilters.length as number | undefined,
			lengthUnit:
				rawFilters.length === undefined ? undefined : (rawFilters.lengthUnit ?? 'syllables'),
			lexicalDensity: rawFilters.lexicalDensity
		},
		seed: (value.seed as string | undefined) ?? newSeed(),
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
