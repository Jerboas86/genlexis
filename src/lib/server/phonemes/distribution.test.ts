import { describe, expect, it } from 'vitest';
import {
	addCounts,
	countsToProbabilities,
	normalizeDistribution,
	subtractCounts,
	sumCounts,
	tokensToCounts
} from './distribution';

describe('distribution helpers', () => {
	it('tallies token occurrences', () => {
		expect.assertions(1);
		expect(tokensToCounts(['a', 'b', 'a', 'a', 'b'])).toEqual({ a: 3, b: 2 });
	});

	it('returns an empty count map for an empty token list', () => {
		expect.assertions(1);
		expect(tokensToCounts([])).toEqual({});
	});

	it('converts counts to probabilities that sum to one', () => {
		expect.assertions(2);
		const probs = countsToProbabilities({ a: 3, b: 1 });
		expect(probs).toEqual({ a: 0.75, b: 0.25 });
		expect(Object.values(probs).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
	});

	it('returns an empty distribution when counts are zero', () => {
		expect.assertions(1);
		expect(countsToProbabilities({})).toEqual({});
	});

	it('adds counts across keys', () => {
		expect.assertions(1);
		expect(addCounts({ a: 1, b: 2 }, { b: 3, c: 1 })).toEqual({ a: 1, b: 5, c: 1 });
	});

	it('subtracts counts and removes drained keys', () => {
		expect.assertions(1);
		expect(subtractCounts({ a: 2, b: 1, c: 4 }, { a: 2, b: 1, c: 1 })).toEqual({ c: 3 });
	});

	it('renormalizes a distribution whose mass differs from one', () => {
		expect.assertions(1);
		const probs = normalizeDistribution({ a: 1, b: 1, c: 2 });
		expect(probs).toEqual({ a: 0.25, b: 0.25, c: 0.5 });
	});

	it('totals counts across all keys', () => {
		expect.assertions(1);
		expect(sumCounts({ a: 3, b: 2, c: 5 })).toBe(10);
	});
});
