import { describe, expect, it, vi } from 'vitest';
import type { PoolEntry } from '@genlexis/core';
import { itemRevisionOf } from './fingerprint';
import { describeProtocolPool, poolDigestOf, PoolError } from './pools';

/**
 * The rules of a pool, against a double of the core's description.
 *
 * What the database returns is the core's to prove; what this file owes is that
 * a pool is named by a revision, filtered as that revision's draws are, and
 * identified the way a draw identifies its items.
 */

const entry = (sentenceId: number, sentence: string, dedupeKey: string): PoolEntry => ({
	sentenceId,
	sentence,
	pattern: 'np_verb',
	dedupeKey,
	phonoIpas: ['ʃa', 'dɔʁ'],
	tokens: [
		{ position: 1, slot: 'det', surface: 'Le', lexical: null },
		{ position: 2, slot: 'noun', surface: 'chat', lexical: null },
		{ position: 3, slot: 'verb', surface: 'dort', lexical: null }
	]
});

const ENTRIES = [
	entry(7, 'Le chat dort.', 'chat dort'),
	entry(8, 'Un chat dort.', 'chat dort'),
	entry(9, 'Le rat court.', 'rat court')
];

const dependencies = (describe = vi.fn(async () => ENTRIES)) => ({
	repository: {} as never,
	describe: describe as never,
	now: () => 1_700_000_000_000
});

describe('describeProtocolPool', () => {
	it('describes the pool a published revision draws from, with its release and filters', async () => {
		const pool = await describeProtocolPool('genlexis-fr-np-verb-r2', dependencies());

		expect(pool.contractVersion).toBe('1');
		expect(pool.protocolRevision).toBe('genlexis-fr-np-verb-r2');
		expect(pool.materialRelease).toEqual({
			sourceId: 'genlexis-fr',
			revision: 'r1',
			poolRevision: 'pool-2026-09-11'
		});
		expect(pool.language).toBe('fr-FR');
		expect(pool.filters).toEqual({ pattern: 'np_verb', lexicalDensity: 'medium' });
		expect(pool.issuedAt).toBe(1_700_000_000_000);
	});

	it('asks for exactly the filters the revision fixes', async () => {
		const describe = vi.fn(async () => ENTRIES);

		await describeProtocolPool('genlexis-fr-np-verb-r2', dependencies(describe));

		expect(describe).toHaveBeenCalledWith(
			expect.objectContaining({ language: 'fr-FR', pattern: 'np_verb', lexicalDensity: 'medium' }),
			expect.anything()
		);
	});

	it('identifies an item as a draw does, and keeps every variant with its pair', async () => {
		const pool = await describeProtocolPool('genlexis-fr-np-verb-r2', dependencies());

		expect(pool.items.map((item) => item.itemId)).toEqual(['7', '8', '9']);
		expect(pool.items[0]!.itemRevision).toBe(await itemRevisionOf('Le chat dort.'));
		expect(pool.items.map((item) => item.pairKey)).toEqual(['chat dort', 'chat dort', 'rat court']);
		expect(pool.items[0]!.tokens).toHaveLength(3);
		expect(pool.items[0]!.homonyms).toEqual([]);
	});

	it('digests the set of items, whatever their order', async () => {
		const pool = await describeProtocolPool('genlexis-fr-np-verb-r2', dependencies());

		expect(pool.poolDigest).toMatch(/^[0-9a-f]{64}$/);
		expect(await poolDigestOf([...pool.items].reverse())).toBe(pool.poolDigest);
		expect(await poolDigestOf(pool.items.slice(1))).not.toBe(pool.poolDigest);
	});

	it('refuses a revision that was never published', async () => {
		await expect(describeProtocolPool('genlexis-fr-np-verb-r9', dependencies())).rejects.toEqual(
			new PoolError('unknown_protocol_revision')
		);
	});

	it('calls an empty pool, or a language without a distribution, unavailable corpus', async () => {
		await expect(
			describeProtocolPool('genlexis-fr-np-verb-r2', dependencies(vi.fn(async () => [])))
		).rejects.toMatchObject({ code: 'corpus_unavailable' });
		await expect(
			describeProtocolPool(
				'genlexis-fr-np-verb-r2',
				dependencies(
					vi.fn(async () => {
						throw new Error('No phoneme distribution found for language "fr-FR"');
					})
				)
			)
		).rejects.toMatchObject({ code: 'corpus_unavailable' });
	});

	it('lets any other failure through, for the route to call unavailable', async () => {
		await expect(
			describeProtocolPool(
				'genlexis-fr-np-verb-r2',
				dependencies(
					vi.fn(async () => {
						throw new Error('connection reset');
					})
				)
			)
		).rejects.toThrow('connection reset');
	});
});
