import { selectBalancedLists } from './phonemes/balancer';
import { addCounts, tokensToCounts } from './phonemes/distribution';
import { createIpaTokenizer } from './phonemes/tokenizer';
import type { PhonemeCounts, PhonemeDistribution, PooledWord } from './phonemes/types';
import type {
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
	HumanClassificationInput,
	SentenceSummary,
	SupportedPattern,
	ValidationRepository
} from './types';

const stripDedupeKey = ({ sentenceId, sentence, pattern }: AcceptedItem): AcceptedSentence => ({
	sentenceId,
	sentence,
	pattern
});

const DEFAULT_POOL_MULTIPLIER = 10;
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
	const poolMultiplier = options.poolMultiplier ?? DEFAULT_POOL_MULTIPLIER;
	const poolSize = Math.max(totalRequested * poolMultiplier, totalRequested + MIN_POOL_HEADROOM);

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

	const seen = new Set<string>();
	const unique: AcceptedItemWithIpa[] = [];
	for (const item of items) {
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
		refinementPasses: options.refinementPasses
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
} from './types';
