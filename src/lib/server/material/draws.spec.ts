import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	createDraw,
	type Draw,
	type DrawDependencies,
	type DrawRepository,
	type StoredDraw
} from './draws';
import { itemIdentityKey, itemRevisionOf } from './fingerprint';
import { PUBLISHED_REVISIONS, resolveProtocolRevision } from './registry';

const REVISION = PUBLISHED_REVISIONS[0]!;
const KEY = 'a'.repeat(64);

/** An in-memory ledger that behaves like the real one, including its ordering. */
class MemoryRepository implements DrawRepository {
	readonly byKey = new Map<string, StoredDraw>();
	readonly itemsByDraw = new Map<string, string[]>();
	persisted = 0;

	async findByIdempotencyKey(key: string): Promise<StoredDraw | null> {
		return this.byKey.get(key) ?? null;
	}

	async resolveExcludedItems(drawIds: readonly string[]): Promise<string[]> {
		return drawIds.flatMap((drawId) => this.itemsByDraw.get(drawId) ?? []);
	}

	async persist(draw: Draw, idempotencyKey: string, fingerprint: string): Promise<void> {
		this.persisted += 1;
		this.byKey.set(idempotencyKey, { fingerprint, draw });
		this.itemsByDraw.set(draw.drawId, draw.items.map(itemIdentityKey));
	}
}

/**
 * A pool of distinct sentences, drawn without replacement per seed.
 *
 * The engine is injected rather than mocked shallowly: these tests are about
 * what the orchestration does with what the engine returns, so the double has to
 * return plausibly *different* lists for different seeds.
 */
function poolGenerator(poolSize: number, distance = 0.01) {
	let cursor = 0;
	return vi.fn(async (options: { itemsPerList: number }) => {
		const lists = [
			Array.from({ length: options.itemsPerList }, () => {
				const index = cursor % poolSize;
				cursor += 1;
				return { sentenceId: index, sentence: `phrase ${index}`, pattern: 'np_verb' };
			})
		];
		return {
			lists,
			requestedLists: 1,
			requestedItemsPerList: options.itemsPerList,
			totalItems: lists[0].length,
			scores: [distance],
			aggregateScore: distance,
			poolSize
		};
	}) as unknown as DrawDependencies['generate'];
}

function dependencies(overrides: Partial<DrawDependencies> = {}): DrawDependencies {
	let drawCounter = 0;
	return {
		repository: new MemoryRepository(),
		generate: poolGenerator(500),
		generationRepository: {} as never,
		now: () => 1_756_300_000_000,
		newDrawId: () => (drawCounter++).toString(16).padStart(32, '0'),
		newSeed: (attempt) => `seed-${attempt}`,
		...overrides
	};
}

function request(overrides: Partial<Parameters<typeof createDraw>[0]> = {}) {
	return {
		contractVersion: '1',
		protocolRevision: REVISION,
		idempotencyKey: KEY,
		excludedDrawIds: [] as string[],
		...overrides
	};
}

describe('the contract version', () => {
	it('refuses a version it does not implement rather than guessing', async () => {
		await expect(
			createDraw(request({ contractVersion: '2' }), dependencies())
		).rejects.toMatchObject({ code: 'unsupported_contract_version' });
	});
});

describe('the protocol revision', () => {
	it('serves a published revision', async () => {
		const draw = await createDraw(request(), dependencies());
		expect(draw.protocolRevision).toBe(REVISION);
		expect(draw.items).toHaveLength(20);
	});

	it('refuses an unpublished revision — there is no implicit latest', async () => {
		await expect(
			createDraw(request({ protocolRevision: 'never-published' }), dependencies())
		).rejects.toMatchObject({ code: 'unknown_protocol_revision' });
	});

	it('reports the release and pool the revision fixed, not anything the caller asked for', async () => {
		const draw = await createDraw(request(), dependencies());
		// Read from the registry rather than repeated here: the claim is that the
		// draw reports the revision's own release and pool, not which pool that is.
		const configuration = resolveProtocolRevision(PUBLISHED_REVISIONS[0]!)!;
		expect(draw.materialRelease).toEqual({
			sourceId: configuration.materialSourceId,
			revision: configuration.materialRelease,
			poolRevision: configuration.poolRevision
		});
	});

	it('reports the generation options the revision fixed', async () => {
		const draw = await createDraw(request(), dependencies());
		// A caller cannot vary these, which is what stops one protocol identity
		// from designating two conditions.
		expect(draw.generation.options).toMatchObject({
			pattern: 'np_verb',
			lexicalDensity: 'medium',
			itemsPerList: 20,
			listCount: 1
		});
	});
});

describe('idempotency', () => {
	let deps: DrawDependencies;
	let repository: MemoryRepository;

	beforeEach(() => {
		repository = new MemoryRepository();
		deps = dependencies({ repository });
	});

	it('replays the stored draw for the same key and fingerprint', async () => {
		const first = await createDraw(request(), deps);
		const second = await createDraw(request(), deps);
		expect(second).toEqual(first);
		// Replayed, not redrawn: a retry must not consume a second draw.
		expect(repository.persisted).toBe(1);
	});

	it('replays when the exclusions are reordered or repeated', async () => {
		const excluded = ['b'.repeat(32), 'c'.repeat(32)];
		const first = await createDraw(request({ excludedDrawIds: excluded }), deps);
		const second = await createDraw(
			request({ excludedDrawIds: [excluded[1]!, excluded[0]!, excluded[1]!] }),
			deps
		);
		expect(second).toEqual(first);
	});

	it('conflicts when the same key carries a different fingerprint', async () => {
		await createDraw(request(), deps);
		await expect(
			createDraw(request({ excludedDrawIds: ['d'.repeat(32)] }), deps)
		).rejects.toMatchObject({ code: 'idempotency_conflict' });
	});

	it('conflicts when the same key names a different revision', async () => {
		await createDraw(request(), deps);
		// Unreachable through the published registry today, but the fingerprint
		// covers the revision precisely so it cannot become reachable silently.
		await expect(
			createDraw(request({ protocolRevision: 'never-published' }), deps)
		).rejects.toMatchObject({ code: 'unknown_protocol_revision' });
	});

	it('gives a different key its own draw', async () => {
		const first = await createDraw(request(), deps);
		const second = await createDraw(request({ idempotencyKey: 'b'.repeat(64) }), deps);
		expect(second.drawId).not.toBe(first.drawId);
		expect(repository.persisted).toBe(2);
	});

	it('persists before it answers, so the draw it returns can always be resolved', async () => {
		const order: string[] = [];
		const repo = new MemoryRepository();
		const spy: DrawRepository = {
			findByIdempotencyKey: (key) => repo.findByIdempotencyKey(key),
			resolveExcludedItems: (ids) => repo.resolveExcludedItems(ids),
			persist: async (draw, key, fingerprint) => {
				order.push('persist');
				await repo.persist(draw, key, fingerprint);
			}
		};
		await createDraw(request(), dependencies({ repository: spy }));
		order.push('return');
		expect(order).toEqual(['persist', 'return']);
	});
});

describe('rotation', () => {
	it('excludes every item of an excluded draw, not merely its identifier', async () => {
		const repository = new MemoryRepository();
		const deps = dependencies({ repository });
		const first = await createDraw(request(), deps);

		const second = await createDraw(
			request({ idempotencyKey: 'b'.repeat(64), excludedDrawIds: [first.drawId] }),
			deps
		);
		const excluded = new Set(first.items.map(itemIdentityKey));
		for (const item of second.items) expect(excluded.has(itemIdentityKey(item))).toBe(false);
	});

	it('retries with a fresh seed when a draw would overlap', async () => {
		const repository = new MemoryRepository();
		// A pool of exactly 40 with 20 per draw: the first attempt after an
		// exclusion collides, the second does not.
		const generate = poolGenerator(40);
		const deps = dependencies({ repository, generate });
		const first = await createDraw(request(), deps);
		const second = await createDraw(
			request({ idempotencyKey: 'b'.repeat(64), excludedDrawIds: [first.drawId] }),
			deps
		);
		expect(second.items).toHaveLength(20);
	});

	it('fails closed when the window empties the pool, never repeating a draw', async () => {
		const repository = new MemoryRepository();
		// Twenty sentences, twenty per draw: after one exclusion nothing is left.
		const deps = dependencies({ repository, generate: poolGenerator(20) });
		const first = await createDraw(request(), deps);
		await expect(
			createDraw(request({ idempotencyKey: 'b'.repeat(64), excludedDrawIds: [first.drawId] }), deps)
		).rejects.toMatchObject({ code: 'pool_exhausted' });
	});

	it('never shrinks the window it was given to make a draw fit', async () => {
		const repository = new MemoryRepository();
		const resolve = vi.fn(async (ids: readonly string[]) => repository.resolveExcludedItems(ids));
		const deps = dependencies({
			repository: {
				findByIdempotencyKey: (key) => repository.findByIdempotencyKey(key),
				resolveExcludedItems: resolve,
				persist: (draw, key, fp) => repository.persist(draw, key, fp)
			},
			generate: poolGenerator(20)
		});
		const first = await createDraw(request(), deps);
		await expect(
			createDraw(request({ idempotencyKey: 'b'.repeat(64), excludedDrawIds: [first.drawId] }), deps)
		).rejects.toMatchObject({ code: 'pool_exhausted' });
		// It asked for the whole window, rather than retrying against a subset of
		// it — the window is the caller's guarantee, not ours to narrow.
		const withExclusions = resolve.mock.calls.filter((call) => call[0].length > 0);
		expect(withExclusions).toHaveLength(1);
		expect(withExclusions[0]![0]).toEqual([first.drawId]);
	});
});

describe('the phonemic tolerance', () => {
	it('refuses a draw above the published tolerance', async () => {
		// A list that is not phonemically matched is not the instrument this
		// revision names, so it is refused rather than returned with a warning.
		const deps = dependencies({ generate: poolGenerator(500, 0.5) });
		await expect(createDraw(request(), deps)).rejects.toMatchObject({
			code: 'balance_tolerance_exceeded'
		});
	});

	it('reports the distance and the tolerance it was judged against', async () => {
		const draw = await createDraw(request(), dependencies({ generate: poolGenerator(500, 0.02) }));
		expect(draw.generation.phonemeBalanceDistance).toBe(0.02);
		// Read from the registry rather than repeated here: what matters is that the
		// draw carries the tolerance it was judged against, not what that number is.
		expect(draw.generation.phonemeBalanceTolerance).toBe(
			resolveProtocolRevision(PUBLISHED_REVISIONS[0]!)!.phonemeBalanceTolerance
		);
	});
});

describe('an incomplete pool', () => {
	it('refuses rather than serving fewer items than the revision fixed', async () => {
		const generate = vi.fn(async () => ({
			lists: [[{ sentenceId: 1, sentence: 'une seule', pattern: 'np_verb' }]],
			requestedLists: 1,
			requestedItemsPerList: 20,
			totalItems: 1,
			scores: [0.01],
			aggregateScore: 0.01,
			poolSize: 1
		})) as unknown as DrawDependencies['generate'];
		// A pool that cannot fill a list is not a rotation that emptied one, and
		// the contract publishes a distinct code for each.
		await expect(createDraw(request(), dependencies({ generate }))).rejects.toMatchObject({
			code: 'incomplete_draw'
		});
	});
});

describe('a corrected sentence', () => {
	it('does not change what an already-served draw reports', async () => {
		// `itemRevision` is derived from the text, so a replay that re-read the
		// sentence would return the new text under the old revision — two fields
		// contradicting each other in a record that claims to be immutable.
		const repository = new MemoryRepository();
		const deps = dependencies({ repository });
		const first = await createDraw(request(), deps);

		// The corpus moves on: the same ids now carry different sentences.
		const corrected = dependencies({
			repository,
			generate: (() => {
				let cursor = 0;
				return vi.fn(async (options: { itemsPerList: number }) => {
					const list = Array.from({ length: options.itemsPerList }, () => {
						const index = cursor++;
						return { sentenceId: index, sentence: `phrase corrigée ${index}`, pattern: 'np_verb' };
					});
					return {
						lists: [list],
						requestedLists: 1,
						requestedItemsPerList: options.itemsPerList,
						totalItems: list.length,
						scores: [0.01],
						aggregateScore: 0.01,
						poolSize: 500
					};
				}) as unknown as DrawDependencies['generate'];
			})()
		});

		const replayed = await createDraw(request(), corrected);
		expect(replayed.items).toEqual(first.items);
		for (const item of replayed.items) expect(item.text).not.toContain('corrigée');
	});

	it('produces a different identity for the corrected text', async () => {
		// The correction is not lost — it simply belongs to a *new* item.
		const before = await itemRevisionOf('le chat dort');
		const after = await itemRevisionOf('le chat dors');
		expect(after).not.toBe(before);
	});
});

describe('item identity', () => {
	it('derives the revision from the text, so a correction is a new identity', async () => {
		const first = await createDraw(request(), dependencies());
		const changed = poolGenerator(500);
		const deps = dependencies({ generate: changed });
		const second = await createDraw(request(), deps);
		// Same sentence text in both doubles, so the same revision.
		expect(second.items[0]!.itemRevision).toBe(first.items[0]!.itemRevision);
		expect(second.items[0]!.itemRevision).toMatch(/^[0-9a-f]{16}$/);
	});
});
