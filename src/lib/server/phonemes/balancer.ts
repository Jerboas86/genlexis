import { l1Distance } from './distance';
import { addCounts, countsToProbabilities, subtractCounts, sumCounts } from './distribution';
import type {
	BalancerOptions,
	ListResult,
	PhonemeCounts,
	PhonemeDistribution,
	PooledWord
} from './types';

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

	const selected: PooledWord[] = [];
	const used = new Set<PooledWord>();
	let currentCounts: PhonemeCounts = {};
	let currentTotal = 0;

	for (let step = 0; step < actualSize; step++) {
		let bestWord: PooledWord | null = null;
		let bestScore = Number.POSITIVE_INFINITY;
		for (const word of usable) {
			if (used.has(word)) continue;
			const candidateScore = scoreAfterAdd(
				currentCounts,
				currentTotal,
				word,
				wordSums.get(word) ?? 0,
				target
			);
			if (candidateScore < bestScore) {
				bestScore = candidateScore;
				bestWord = word;
			}
		}
		if (!bestWord) break;
		selected.push(bestWord);
		used.add(bestWord);
		currentCounts = addCounts(currentCounts, bestWord.counts);
		currentTotal += wordSums.get(bestWord) ?? 0;
	}

	let currentScore = score(currentCounts, target);

	for (let pass = 0; pass < refinementPasses; pass++) {
		let improved = false;
		for (let index = 0; index < selected.length; index++) {
			const outgoing = selected[index];
			const outgoingSum = wordSums.get(outgoing) ?? 0;
			const withoutCounts = subtractCounts(currentCounts, outgoing.counts);
			const withoutTotal = currentTotal - outgoingSum;

			let bestSwap: PooledWord | null = null;
			let bestSwapScore = currentScore;
			for (const candidate of usable) {
				if (used.has(candidate)) continue;
				const candidateScore = scoreAfterAdd(
					withoutCounts,
					withoutTotal,
					candidate,
					wordSums.get(candidate) ?? 0,
					target
				);
				if (candidateScore < bestSwapScore) {
					bestSwapScore = candidateScore;
					bestSwap = candidate;
				}
			}

			if (bestSwap) {
				used.delete(outgoing);
				used.add(bestSwap);
				selected[index] = bestSwap;
				currentCounts = addCounts(withoutCounts, bestSwap.counts);
				currentTotal = withoutTotal + (wordSums.get(bestSwap) ?? 0);
				currentScore = bestSwapScore;
				improved = true;
			}
		}
		if (!improved) break;
	}

	return { items: selected, score: currentScore };
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
