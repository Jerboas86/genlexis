import { describe, expect, it } from 'vitest';
import {
	canonicaliseExclusions,
	createDrawId,
	itemIdentityKey,
	itemRevisionOf,
	requestFingerprint
} from './fingerprint';

describe('canonicaliseExclusions', () => {
	it('sorts and de-duplicates', () => {
		expect(canonicaliseExclusions(['b', 'a', 'b'])).toEqual(['a', 'b']);
	});

	it('leaves the given array untouched', () => {
		const original = ['b', 'a'];
		canonicaliseExclusions(original);
		expect(original).toEqual(['b', 'a']);
	});
});

describe('requestFingerprint', () => {
	it('is stable for the same request', async () => {
		expect(await requestFingerprint('1', 'rev', ['a'])).toBe(
			await requestFingerprint('1', 'rev', ['a'])
		);
	});

	it('ignores the order and repetition of the exclusions', async () => {
		// A reordered retry is the same request; treating it as a different one
		// would look to the caller like a bug in their rotation rather than ours.
		expect(await requestFingerprint('1', 'rev', ['a', 'b'])).toBe(
			await requestFingerprint('1', 'rev', ['b', 'a', 'b'])
		);
	});

	it('changes when the contract version changes', async () => {
		expect(await requestFingerprint('1', 'rev', [])).not.toBe(
			await requestFingerprint('2', 'rev', [])
		);
	});

	it('changes when the protocol revision changes', async () => {
		expect(await requestFingerprint('1', 'rev-a', [])).not.toBe(
			await requestFingerprint('1', 'rev-b', [])
		);
	});

	it('changes when the exclusion set changes', async () => {
		expect(await requestFingerprint('1', 'rev', ['a'])).not.toBe(
			await requestFingerprint('1', 'rev', ['a', 'b'])
		);
		expect(await requestFingerprint('1', 'rev', [])).not.toBe(
			await requestFingerprint('1', 'rev', ['a'])
		);
	});

	it('cannot be confused by fields running together', async () => {
		// A revision ending in a digit beside an exclusion starting with one would
		// concatenate identically if the fields were simply joined.
		expect(await requestFingerprint('1', 'rev1', ['2'])).not.toBe(
			await requestFingerprint('1', 'rev', ['12'])
		);
	});

	it('is a hex digest rather than the request in clear', async () => {
		const fingerprint = await requestFingerprint('1', 'rev', ['a'.repeat(32)]);
		expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
		expect(fingerprint).not.toContain('a'.repeat(32));
	});
});

describe('itemRevisionOf', () => {
	it('is stable for the same text', async () => {
		expect(await itemRevisionOf('le chat dort')).toBe(await itemRevisionOf('le chat dort'));
	});

	it('changes when the text changes, so a correction is a new identity', async () => {
		// Derived rather than stored, which makes the contract's rule true by
		// construction instead of by anyone remembering to bump a column.
		expect(await itemRevisionOf('le chat dort')).not.toBe(await itemRevisionOf('le chat dors'));
	});

	it('is short and hexadecimal', async () => {
		expect(await itemRevisionOf('x')).toMatch(/^[0-9a-f]{16}$/);
	});
});

describe('itemIdentityKey', () => {
	it('separates the same item at two revisions', () => {
		expect(itemIdentityKey({ itemId: '1', itemRevision: 'a' })).not.toBe(
			itemIdentityKey({ itemId: '1', itemRevision: 'b' })
		);
	});

	it('separates two items at the same revision', () => {
		expect(itemIdentityKey({ itemId: '1', itemRevision: 'a' })).not.toBe(
			itemIdentityKey({ itemId: '2', itemRevision: 'a' })
		);
	});
});

describe('createDrawId', () => {
	it('is opaque, random and not a sequence', () => {
		// A sequence would leak how many draws exist and let one caller guess
		// another's, and a drawId resolves to the exact sentences a session heard.
		const first = createDrawId();
		expect(first).toMatch(/^[0-9a-f]{32}$/);
		expect(createDrawId()).not.toBe(first);
	});
});
