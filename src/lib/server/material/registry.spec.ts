import { describe, expect, it } from 'vitest';
import { PUBLISHED_REVISIONS, resolveProtocolRevision } from './registry';

describe('the protocol registry', () => {
	it('publishes at least one revision', () => {
		expect(PUBLISHED_REVISIONS.length).toBeGreaterThan(0);
	});

	it('resolves a published revision to its frozen configuration', () => {
		const configuration = resolveProtocolRevision(PUBLISHED_REVISIONS[0]!);
		expect(configuration).not.toBeNull();
		expect(configuration!.itemsPerList).toBeGreaterThan(0);
		expect(configuration!.poolRevision).toBeTruthy();
		expect(configuration!.phonemeBalanceTolerance).toBeGreaterThan(0);
	});

	it('returns null for an unpublished revision rather than a default', () => {
		// There is no configuration a caller could sensibly be given instead, and
		// silently serving one would let an unknown name designate real material.
		expect(resolveProtocolRevision('never-published')).toBeNull();
		expect(resolveProtocolRevision('')).toBeNull();
	});

	it('is not fooled by inherited object properties', () => {
		// `toString` and friends are on every object; a naive lookup would resolve
		// them to a function and crash somewhere far less obvious.
		for (const name of ['toString', 'constructor', '__proto__', 'hasOwnProperty']) {
			expect(resolveProtocolRevision(name)).toBeNull();
		}
	});

	it('hands out a configuration that cannot be mutated', () => {
		// Editing an entry in place would retroactively change what every session
		// already recorded under it claims to have measured.
		const configuration = resolveProtocolRevision(PUBLISHED_REVISIONS[0]!)!;
		expect(() => {
			(configuration as { itemsPerList: number }).itemsPerList = 1;
		}).toThrow();
		expect(resolveProtocolRevision(PUBLISHED_REVISIONS[0]!)!.itemsPerList).not.toBe(1);
	});

	it('names a material source that is not a Voxa corpus identity', () => {
		for (const revision of PUBLISHED_REVISIONS) {
			const configuration = resolveProtocolRevision(revision)!;
			expect(configuration.materialSourceId).toBeTruthy();
			expect(configuration.materialRelease).toBeTruthy();
			// Transitional material must never present itself as a published corpus.
			expect(configuration.materialSourceId).not.toBe('corpus');
		}
	});

	it('allows enough attempts for a rotation to find a non-overlapping draw', () => {
		for (const revision of PUBLISHED_REVISIONS) {
			expect(resolveProtocolRevision(revision)!.maxDrawAttempts).toBeGreaterThan(1);
		}
	});
});
