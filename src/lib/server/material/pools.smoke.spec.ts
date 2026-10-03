import { beforeAll, describe, expect, it } from 'vitest';

/**
 * A pool against a real database, read only.
 *
 * The rules are proven in `pools.spec.ts` against a double. What a double cannot
 * prove is that the pool query reads the same universe the draw query samples:
 * that every sentence a uniform draw can serve is in the pool, once per variant,
 * and that the words carry their lexical entries.
 *
 * Skipped unless `GENLEXIS_SMOKE=1`:
 *
 *   doppler run -p genlexis -c dev -- \
 *     env GENLEXIS_SMOKE=1 pnpm exec vitest --run --project server pools.smoke
 *
 * It writes nothing: the draws below go through the engine, not the service, so
 * no draw is persisted.
 */
const enabled = process.env.GENLEXIS_SMOKE === '1';
const REVISION = 'genlexis-fr-np-verb-r2';

describe.skipIf(!enabled)('a pool against a real database', () => {
	let pool: import('./pools').Pool;
	let configuration: import('./registry').ProtocolConfiguration;
	let repository: typeof import('$lib/server/genlexis/repository').repository;

	beforeAll(async () => {
		const { describeProtocolPool } = await import('./pools');
		const { resolveProtocolRevision } = await import('./registry');
		({ repository } = await import('$lib/server/genlexis/repository'));
		configuration = resolveProtocolRevision(REVISION)!;
		pool = await describeProtocolPool(REVISION, { repository });
	}, 60_000);

	it('holds more items than a draw takes, and more items than pairs', () => {
		const pairs = new Set(pool.items.map((item) => item.pairKey));
		expect(pool.items.length).toBeGreaterThan(configuration.itemsPerList);
		expect(pairs.size).toBeLessThanOrEqual(pool.items.length);
		console.log(
			JSON.stringify({ items: pool.items.length, pairs: pairs.size, digest: pool.poolDigest })
		);
	});

	it('describes every noun and verb with its lexical entry, in sentence order', () => {
		for (const item of pool.items) {
			expect(item.tokens.map((token) => token.position)).toEqual(
				[...item.tokens.map((token) => token.position)].sort((a, b) => a - b)
			);
			for (const token of item.tokens.filter((t) => t.slot === 'noun' || t.slot === 'verb')) {
				expect(token.lexical).not.toBeNull();
				expect(token.lexical!.phonoIpa).toBeTruthy();
			}
		}
	});

	it('contains every sentence a uniform draw serves, one variant per pair', async () => {
		const { generateUniformAcceptedSentences } = await import('@genlexis/core');
		const inPool = new Map(pool.items.map((item) => [Number(item.itemId), item.pairKey]));
		for (const seed of ['smoke-1', 'smoke-2', 'smoke-3']) {
			const result = await generateUniformAcceptedSentences(
				{
					language: configuration.language,
					pattern: configuration.pattern,
					lexicalDensity: configuration.lexicalDensity,
					listCount: 1,
					itemsPerList: configuration.itemsPerList,
					seed
				},
				repository
			);
			const drawn = result.lists[0]!.map((sentence) => sentence.sentenceId);
			expect(drawn.every((id) => inPool.has(id))).toBe(true);
			expect(new Set(drawn.map((id) => inPool.get(id))).size).toBe(drawn.length);
		}
	});

	it('lists as many pairs as a draw can choose from', async () => {
		const items = await repository.findAcceptedItemsWithIpa({
			language: configuration.language,
			pattern: configuration.pattern,
			lexicalDensity: configuration.lexicalDensity,
			poolSize: 100_000
		});
		// The draw's query keeps one variant per pair, so its size is the pool's pair count —
		// less any pair whose transcriptions yield no phoneme, which neither may serve.
		const pairs = new Set(pool.items.map((item) => item.pairKey));
		expect(pairs.size).toBeLessThanOrEqual(items.length);
		expect(items.length - pairs.size).toBeLessThan(5);
	});
});
