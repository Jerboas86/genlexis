import { l1Distance } from './distance.js';
import { addCounts, countsToProbabilities, subtractCounts, sumCounts } from './distribution.js';
import type {
	BalancerOptions,
	ListResult,
	PhonemeCounts,
	PhonemeDistribution,
	PooledWord
} from './types.js';

const scoreAfterAdd = (
	current: PhonemeCounts,
	currentTotal: number,
	word: PooledWord,
	wordSum: number,
	target: PhonemeDistribution
): number => {
	const newTotal = currentTotal + wordSum;
	if (newTotal === 0) return l1Distance(target, {});

	const seen = new Set<string>();
	let sum = 0;
	for (const key in target) {
		seen.add(key);
		const merged = (current[key] ?? 0) + (word.counts[key] ?? 0);
		sum += Math.abs(target[key] - merged / newTotal);
	}
	for (const key in current) {
		if (seen.has(key)) continue;
		seen.add(key);
		const merged = current[key] + (word.counts[key] ?? 0);
		sum += merged / newTotal;
	}
	for (const key in word.counts) {
		if (seen.has(key)) continue;
		sum += word.counts[key] / newTotal;
	}
	return sum;
};

const score = (counts: PhonemeCounts, target: PhonemeDistribution): number =>
	l1Distance(target, countsToProbabilities(counts));

type ScoredWord = { word: PooledWord; score: number };

type SelectionState = {
	items: PooledWord[];
	used: Set<PooledWord>;
	counts: PhonemeCounts;
	total: number;
	score: number;
};

const findBestAvailableWord = (
	pool: PooledWord[],
	used: Set<PooledWord>,
	counts: PhonemeCounts,
	total: number,
	wordSums: Map<PooledWord, number>,
	target: PhonemeDistribution,
	maximumScore = Number.POSITIVE_INFINITY
): ScoredWord | null => {
	let best: ScoredWord | null = null;
	let bestScore = maximumScore;

	for (const word of pool) {
		if (used.has(word)) continue;
		const candidateScore = scoreAfterAdd(counts, total, word, wordSums.get(word) ?? 0, target);
		if (candidateScore < bestScore) {
			best = { word, score: candidateScore };
			bestScore = candidateScore;
		}
	}

	return best;
};

const selectGreedy = (
	pool: PooledWord[],
	target: PhonemeDistribution,
	size: number,
	wordSums: Map<PooledWord, number>
): SelectionState => {
	const state: SelectionState = {
		items: [],
		used: new Set(),
		counts: {},
		total: 0,
		score: l1Distance(target, {})
	};

	for (let step = 0; step < size; step++) {
		const best = findBestAvailableWord(
			pool,
			state.used,
			state.counts,
			state.total,
			wordSums,
			target
		);
		if (!best) break;

		state.items.push(best.word);
		state.used.add(best.word);
		state.counts = addCounts(state.counts, best.word.counts);
		state.total += wordSums.get(best.word) ?? 0;
	}

	state.score = score(state.counts, target);
	return state;
};

const refineSelectionOnce = (
	state: SelectionState,
	pool: PooledWord[],
	target: PhonemeDistribution,
	wordSums: Map<PooledWord, number>
): boolean => {
	let improved = false;

	for (let index = 0; index < state.items.length; index++) {
		const outgoing = state.items[index];
		const withoutCounts = subtractCounts(state.counts, outgoing.counts);
		const withoutTotal = state.total - (wordSums.get(outgoing) ?? 0);
		const bestSwap = findBestAvailableWord(
			pool,
			state.used,
			withoutCounts,
			withoutTotal,
			wordSums,
			target,
			state.score
		);
		if (!bestSwap) continue;

		state.used.delete(outgoing);
		state.used.add(bestSwap.word);
		state.items[index] = bestSwap.word;
		state.counts = addCounts(withoutCounts, bestSwap.word.counts);
		state.total = withoutTotal + (wordSums.get(bestSwap.word) ?? 0);
		state.score = bestSwap.score;
		improved = true;
	}

	return improved;
};

const refineSelection = (
	state: SelectionState,
	pool: PooledWord[],
	target: PhonemeDistribution,
	wordSums: Map<PooledWord, number>,
	passes: number
): void => {
	for (let pass = 0; pass < passes; pass++) {
		if (!refineSelectionOnce(state, pool, target, wordSums)) break;
	}
};

export const selectBalancedList = (
	pool: PooledWord[],
	target: PhonemeDistribution,
	size: number,
	refinementPasses = 3
): ListResult => {
	const usable = pool.filter((word) => sumCounts(word.counts) > 0);
	if (size <= 0 || usable.length === 0) {
		return { items: [], score: l1Distance(target, {}) };
	}

	const actualSize = Math.min(size, usable.length);
	const wordSums = new Map<PooledWord, number>();
	for (const word of usable) wordSums.set(word, sumCounts(word.counts));

	const state = selectGreedy(usable, target, actualSize, wordSums);
	refineSelection(state, usable, target, wordSums, refinementPasses);

	return { items: state.items, score: state.score };
};

export const selectBalancedLists = (
	pool: PooledWord[],
	target: PhonemeDistribution,
	listCount: number,
	size: number,
	options: BalancerOptions = {}
): ListResult[] => {
	const { allowReuse = false, refinementPasses = 3 } = options;
	const results: ListResult[] = [];

	if (allowReuse) {
		for (let i = 0; i < listCount; i++) {
			results.push(selectBalancedList(pool, target, size, refinementPasses));
		}
		return results;
	}

	let remaining = [...pool];
	for (let i = 0; i < listCount; i++) {
		const result = selectBalancedList(remaining, target, size, refinementPasses);
		results.push(result);
		const consumed = new Set(result.items);
		remaining = remaining.filter((word) => !consumed.has(word));
	}
	return results;
};
