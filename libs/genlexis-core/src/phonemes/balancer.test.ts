import { describe, expect, it } from 'vitest';
import { selectBalancedList, selectBalancedLists } from './balancer';
import { l1Distance } from './distance';
import { countsToProbabilities } from './distribution';
import type { PooledWord } from './types';

const pool: PooledWord[] = [
	{ id: 'aaa', counts: { a: 3 } },
	{ id: 'bbb', counts: { b: 3 } },
	{ id: 'ab', counts: { a: 1, b: 1 } },
	{ id: 'aab', counts: { a: 2, b: 1 } },
	{ id: 'abb', counts: { a: 1, b: 2 } },
	{ id: 'aaabbb', counts: { a: 3, b: 3 } }
];

const aggregate = (items: PooledWord[]) => {
	const counts: Record<string, number> = {};
	for (const item of items) {
		for (const key in item.counts) counts[key] = (counts[key] ?? 0) + item.counts[key];
	}
	return countsToProbabilities(counts);
};

describe('selectBalancedList', () => {
	it('returns an empty list with the empty-distribution score when size is zero', () => {
		expect.assertions(2);
		const result = selectBalancedList(pool, { a: 0.5, b: 0.5 }, 0);
		expect(result.items).toEqual([]);
		expect(result.score).toBe(l1Distance({ a: 0.5, b: 0.5 }, {}));
	});

	it('returns an empty list when the pool has no usable words', () => {
		expect.assertions(1);
		const emptyPool: PooledWord[] = [{ id: 'x', counts: {} }];
		const result = selectBalancedList(emptyPool, { a: 1 }, 3);
		expect(result.items).toEqual([]);
	});

	it('drives the aggregate distribution close to the target', () => {
		expect.assertions(2);
		const target = { a: 0.5, b: 0.5 };
		const result = selectBalancedList(pool, target, 2);
		expect(result.score).toBeLessThanOrEqual(0.1);
		const aggregateDistance = l1Distance(target, aggregate(result.items));
		expect(aggregateDistance).toBeCloseTo(result.score, 10);
	});

	it('beats the average random selection of the same size', () => {
		expect.assertions(1);
		const target = { a: 0.75, b: 0.25 };
		const balanced = selectBalancedList(pool, target, 2);
		let randomSum = 0;
		let randomCount = 0;
		for (let i = 0; i < pool.length; i++) {
			for (let j = i + 1; j < pool.length; j++) {
				randomSum += l1Distance(target, aggregate([pool[i], pool[j]]));
				randomCount++;
			}
		}
		const randomAverage = randomSum / randomCount;
		expect(balanced.score).toBeLessThan(randomAverage);
	});

	it('caps selection at the pool size when size exceeds availability', () => {
		expect.assertions(1);
		const smallPool: PooledWord[] = [
			{ id: 1, counts: { a: 1 } },
			{ id: 2, counts: { b: 1 } }
		];
		const result = selectBalancedList(smallPool, { a: 0.5, b: 0.5 }, 10);
		expect(result.items).toHaveLength(2);
	});

	it('never worsens the score during refinement passes', () => {
		expect.assertions(1);
		const target = { a: 0.5, b: 0.5 };
		const withoutRefinement = selectBalancedList(pool, target, 3, 0);
		const withRefinement = selectBalancedList(pool, target, 3, 5);
		expect(withRefinement.score).toBeLessThanOrEqual(withoutRefinement.score);
	});
});

describe('selectBalancedLists', () => {
	it('produces the requested number of lists', () => {
		expect.assertions(1);
		const results = selectBalancedLists(pool, { a: 0.5, b: 0.5 }, 3, 1);
		expect(results).toHaveLength(3);
	});

	it('keeps lists disjoint when reuse is disabled', () => {
		expect.assertions(1);
		const results = selectBalancedLists(pool, { a: 0.5, b: 0.5 }, 3, 2, { allowReuse: false });
		const ids = results.flatMap((list) => list.items.map((item) => item.id));
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('allows the same word across lists when reuse is enabled', () => {
		expect.assertions(1);
		const monoPool: PooledWord[] = [
			{ id: 'p', counts: { a: 1, b: 1 } },
			{ id: 'q', counts: { a: 5 } }
		];
		const results = selectBalancedLists(monoPool, { a: 0.5, b: 0.5 }, 2, 1, {
			allowReuse: true
		});
		expect(results[0].items[0].id).toBe(results[1].items[0].id);
	});

	it('returns shorter lists when the pool runs out across non-reused lists', () => {
		expect.assertions(1);
		const tinyPool: PooledWord[] = [
			{ id: 1, counts: { a: 1 } },
			{ id: 2, counts: { b: 1 } },
			{ id: 3, counts: { a: 1, b: 1 } }
		];
		const results = selectBalancedLists(tinyPool, { a: 0.5, b: 0.5 }, 3, 2, {
			allowReuse: false
		});
		const totalSelected = results.reduce((acc, list) => acc + list.items.length, 0);
		expect(totalSelected).toBeLessThanOrEqual(tinyPool.length);
	});
});
