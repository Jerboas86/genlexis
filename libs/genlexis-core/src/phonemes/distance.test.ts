import { describe, expect, it } from 'vitest';
import { l1Distance } from './distance';

describe('l1Distance', () => {
	it('is zero for identical distributions', () => {
		expect.assertions(1);
		const p = { a: 0.5, b: 0.5 };
		expect(l1Distance(p, p)).toBe(0);
	});

	it('is two for distributions with disjoint support', () => {
		expect.assertions(1);
		expect(l1Distance({ a: 1 }, { b: 1 })).toBe(2);
	});

	it('is symmetric', () => {
		expect.assertions(1);
		const p = { a: 0.6, b: 0.3, c: 0.1 };
		const q = { a: 0.2, b: 0.4, d: 0.4 };
		expect(l1Distance(p, q)).toBeCloseTo(l1Distance(q, p), 12);
	});

	it('treats missing keys as zero', () => {
		expect.assertions(1);
		expect(l1Distance({ a: 0.5, b: 0.5 }, { a: 1 })).toBeCloseTo(1, 12);
	});

	it('counts out-of-target mass against the target', () => {
		expect.assertions(1);
		expect(l1Distance({ a: 1 }, { a: 0.5, b: 0.5 })).toBeCloseTo(1, 12);
	});

	it('returns zero for two empty distributions', () => {
		expect.assertions(1);
		expect(l1Distance({}, {})).toBe(0);
	});
});
