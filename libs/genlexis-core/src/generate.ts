import { selectBalancedLists } from './phonemes/balancer.js';
import { addCounts, tokensToCounts } from './phonemes/distribution.js';
import { createIpaTokenizer } from './phonemes/tokenizer.js';
import type { PhonemeCounts, PooledWord } from './phonemes/types.js';
import type {
	AcceptedItem,
	AcceptedItemWithIpa,
	AcceptedSentence,
	BalancedGenerateResult,
	GenerateBalancedOptions,
	GenerateOptions,
	GenerateResult,
	GenerationRepository,
	HumanClassificationInput,
	SentenceSummary,
	SupportedPattern,
	ValidationRepository
} from './types.js';

const stripDedupeKey = ({ sentenceId, sentence, pattern }: AcceptedItem): AcceptedSentence => ({
	sentenceId,
	sentence,
	pattern
});

/**
 * How many accepted items a balanced draw is shown.
 *
 * Not a multiple of the request, which is what this used to be. The balancer
 * picks its list out of whatever it is handed, so a pool smaller than the
 * accepted corpus silently throws candidates away — and the loss is invisible,
 * because the draw still succeeds, just less well balanced.
 *
 * Measured on a 544-sentence corpus, the old ceiling of 200 cost more than the
 * corpus had gained: a fresh draw's p90 distance ran 0.160 against 0.123 with
 * the whole corpus in view, and a draw rotating away from three earlier ones
 * went from 2 attempts in 20 meeting the tolerance to 13. Growing the corpus
 * past 200 had been making draws *worse*.
 *
 * The number is a ceiling on a known corpus rather than an arbitrary bound. The
 * `np_verb` band this serves tops out at about 3 200 generated sentences, so
 * this covers it whole with room to spare. It is not unbounded because the
 * balancer scans the entire pool once per selected item and once per item per
 * refinement pass — roughly 80 full scans for a 20-item list — so the cost is
 * linear in the pool and a pool of tens of thousands would be felt.
 *
 * A corpus larger than this is subset again, silently as before. The signal is
 * already in the result: `poolSize` reports what the balancer actually saw, and
 * seeing it pinned at this value means the corpus has outgrown it.
 */
const DEFAULT_POOL_SIZE = 4000;

/**
 * The floor, for callers that ask for a deliberately small pool.
 *
 * A pool barely larger than the request leaves the balancer no choice at all.
 */
const MIN_POOL_HEADROOM = 100;

export const generateAcceptedSentences = async (
	options: GenerateOptions,
	repository: GenerationRepository
): Promise<GenerateResult> => {
	const listCount = Math.max(1, Math.min(5, Math.floor(options.listCount)));
	const itemsPerList = Math.max(1, Math.floor(options.itemsPerList));
	const target = listCount * itemsPerList;

	const items = await repository.findRandomAcceptedItems({
		pattern: options.pattern,
		detType: options.detType,
		gender: options.gender,
		grammNumber: options.grammNumber,
		lengthUnit: options.lengthUnit,
		length: options.length,
		lexicalDensity: options.lexicalDensity,
		limit: target,
		seed: options.seed
	});

	const seen = new Set<string>();
	const unique: AcceptedItem[] = [];
	for (const item of items) {
		if (seen.has(item.dedupeKey)) continue;
		seen.add(item.dedupeKey);
		unique.push(item);
		if (unique.length >= target) break;
	}

	const lists: AcceptedSentence[][] = Array.from({ length: listCount }, () => []);
	unique.forEach((item, index) => {
		lists[index % listCount].push(stripDedupeKey(item));
	});

	return {
		lists,
		requestedLists: listCount,
		requestedItemsPerList: itemsPerList,
		totalItems: unique.length
	};
};

export const generateBalancedAcceptedSentences = async (
	options: GenerateBalancedOptions,
	repository: GenerationRepository
): Promise<BalancedGenerateResult> => {
	const listCount = Math.max(1, Math.min(5, Math.floor(options.listCount)));
	const itemsPerList = Math.max(1, Math.floor(options.itemsPerList));
	const target = await repository.getPhonemeDistribution(options.language);

	if (Object.keys(target).length === 0) {
		throw new Error(`No phoneme distribution found for language "${options.language}"`);
	}

	const totalRequested = listCount * itemsPerList;
	// An explicit multiplier still means what it always did — a caller asking for
	// a deliberately narrow pool gets one. The default no longer scales with the
	// request, because the right pool is the corpus, not a multiple of 20.
	const poolSize =
		options.poolMultiplier === undefined
			? Math.max(DEFAULT_POOL_SIZE, totalRequested + MIN_POOL_HEADROOM)
			: Math.max(totalRequested * options.poolMultiplier, totalRequested + MIN_POOL_HEADROOM);

	const items = await repository.findAcceptedItemsWithIpa({
		language: options.language,
		pattern: options.pattern,
		detType: options.detType,
		gender: options.gender,
		grammNumber: options.grammNumber,
		lengthUnit: options.lengthUnit,
		length: options.length,
		lexicalDensity: options.lexicalDensity,
		poolSize,
		seed: options.seed
	});

	const excluded = new Set(options.excludedSentenceIds ?? []);
	const seen = new Set<string>();
	const unique: AcceptedItemWithIpa[] = [];
	for (const item of items) {
		if (excluded.has(item.sentenceId)) continue;
		if (seen.has(item.dedupeKey)) continue;
		seen.add(item.dedupeKey);
		unique.push(item);
	}

	const tokenizer = createIpaTokenizer(Object.keys(target), options.tokenizerOptions);
	const itemsById = new Map<number, AcceptedItemWithIpa>();
	const pool: PooledWord[] = [];
	for (const item of unique) {
		let counts: PhonemeCounts = {};
		for (const ipa of item.phonoIpas) {
			if (!ipa) continue;
			const { tokens } = tokenizer.tokenize(ipa);
			counts = addCounts(counts, tokensToCounts(tokens));
		}
		if (Object.keys(counts).length === 0) continue;
		itemsById.set(item.sentenceId, item);
		pool.push({ id: item.sentenceId, counts });
	}

	const balanced = selectBalancedLists(pool, target, listCount, itemsPerList, {
		allowReuse: options.allowReuseAcrossLists ?? false,
		refinementPasses: options.refinementPasses,
		// Ordering the pool is not enough: the greedy pass takes a global argmin
		// and would ignore it. The seed has to reach the selection itself.
		seed: options.seed
	});

	const lists: AcceptedSentence[][] = balanced.map((list) =>
		list.items.map((picked) => {
			const item = itemsById.get(picked.id as number);
			if (!item) throw new Error('Balancer returned a word not present in the pool');
			return stripDedupeKey(item);
		})
	);

	const scores = balanced.map((list) => list.score);
	const totalItems = lists.reduce((acc, list) => acc + list.length, 0);
	const aggregateScore =
		scores.length === 0 ? 0 : scores.reduce((acc, score) => acc + score, 0) / scores.length;

	return {
		lists,
		requestedLists: listCount,
		requestedItemsPerList: itemsPerList,
		totalItems,
		scores,
		aggregateScore,
		poolSize: pool.length
	};
};

export const getAcceptedSentenceCount = (repository: GenerationRepository): Promise<number> =>
	repository.countAcceptedSentences();

export const getValidationCandidate = (
	pattern: SupportedPattern | undefined,
	repository: ValidationRepository
): Promise<SentenceSummary | null> => repository.findLeastVotedValidationCandidate(pattern);

export const recordValidation = (
	sentenceId: number,
	isCorrect: boolean,
	repository: ValidationRepository
): Promise<void> => repository.recordValidation(sentenceId, isCorrect);

export const recordHumanClassification = (
	sentenceId: number,
	input: HumanClassificationInput,
	repository: ValidationRepository
): Promise<void> => repository.recordHumanClassification(sentenceId, input);

export type {
	AcceptedItem,
	AcceptedItemWithIpa,
	AcceptedSentence,
	BalancedGenerateResult,
	FindAcceptedItemsOptions,
	FindAcceptedItemsWithIpaOptions,
	GenerateBalancedOptions,
	GenerateOptions,
	GenerateResult,
	GenerationRepository,
	GenlexisRepository,
	ValidationRepository
} from './types.js';
