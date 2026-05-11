import type { PhonemeDistribution } from './types';

export const l1Distance = (target: PhonemeDistribution, candidate: PhonemeDistribution): number => {
	const seen = new Set<string>();
	let sum = 0;
	for (const key in target) {
		seen.add(key);
		sum += Math.abs(target[key] - (candidate[key] ?? 0));
	}
	for (const key in candidate) {
		if (seen.has(key)) continue;
		sum += Math.abs(candidate[key]);
	}
	return sum;
};
