import type { PhonemeCounts, PhonemeDistribution } from './types';

export const tokensToCounts = (tokens: string[]): PhonemeCounts => {
	const counts: PhonemeCounts = {};
	for (const token of tokens) counts[token] = (counts[token] ?? 0) + 1;
	return counts;
};

export const sumCounts = (counts: PhonemeCounts): number => {
	let total = 0;
	for (const key in counts) total += counts[key];
	return total;
};

export const countsToProbabilities = (counts: PhonemeCounts): PhonemeDistribution => {
	const total = sumCounts(counts);
	if (total === 0) return {};
	const probabilities: PhonemeDistribution = {};
	for (const key in counts) probabilities[key] = counts[key] / total;
	return probabilities;
};

export const addCounts = (target: PhonemeCounts, addend: PhonemeCounts): PhonemeCounts => {
	const out: PhonemeCounts = { ...target };
	for (const key in addend) out[key] = (out[key] ?? 0) + addend[key];
	return out;
};

export const subtractCounts = (target: PhonemeCounts, subtrahend: PhonemeCounts): PhonemeCounts => {
	const out: PhonemeCounts = { ...target };
	for (const key in subtrahend) {
		const next = (out[key] ?? 0) - subtrahend[key];
		if (next <= 0) delete out[key];
		else out[key] = next;
	}
	return out;
};

export const normalizeDistribution = (distribution: PhonemeDistribution): PhonemeDistribution => {
	const total = sumCounts(distribution);
	if (total === 0) return {};
	const out: PhonemeDistribution = {};
	for (const key in distribution) out[key] = distribution[key] / total;
	return out;
};
