/**
 * `@genlexis/core` — the generation and phoneme-balancing engine.
 *
 * The public surface is deliberately short and database-free. Everything here
 * works against a `GenerationRepository` the caller injects: the accepted
 * corpus, the votes and the phoneme distribution live in Genlexis and are not
 * shipped with the package.
 *
 * The Drizzle-backed implementation of that repository is **not** exported from
 * this entry point. It lives under `@genlexis/core/adapters/drizzle`, so a
 * bundle that only generates never pulls `drizzle-orm` in.
 *
 * Compatibility follows SemVer. Before `1.0.0` a minor release may still remove
 * a public symbol; after it, only a major release may.
 */

export * from './types.js';
export * from './generate.js';
export { frenchLanguagePreset } from './presets/fr-FR.js';
export type {
	IpaTokenizer,
	PhonemeCounts,
	PhonemeDistribution,
	PooledWord,
	ListResult,
	BalancerOptions,
	TokenizationResult,
	TokenizerOptions
} from './phonemes/types.js';
export { createIpaTokenizer } from './phonemes/tokenizer.js';
export { selectBalancedList, selectBalancedLists } from './phonemes/balancer.js';
export {
	tokensToCounts,
	sumCounts,
	countsToProbabilities,
	addCounts,
	subtractCounts,
	normalizeDistribution
} from './phonemes/distribution.js';
export { l1Distance } from './phonemes/distance.js';
