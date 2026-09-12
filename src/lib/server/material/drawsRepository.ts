/**
 * The database half of the draw service.
 *
 * Everything here is bookkeeping; the rules live in `draws.ts` and are tested
 * without a connection. What this file owes them is that `persist` is atomic —
 * a draw whose items were not written cannot be resolved, and a rotation that
 * cannot resolve an exclusion is a rotation that silently does nothing.
 */

import { eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { materialDrawItems, materialDraws, materialIdempotency } from '$lib/server/db/schema';
import type { Draw, DrawRepository, StoredDraw } from './draws';
import { itemIdentityKey } from './fingerprint';

/**
 * How long a stored result answers for a repeated key.
 *
 * It has to outlast every window that might replay the request: the caller's
 * retries, its rotation window, and the transfer window during which a draw must
 * still resolve. Ninety days is the published figure in `limits.json`.
 */
const IDEMPOTENCY_RETENTION_DAYS = 90;

type Database = typeof db;

/** The persisted draw, rebuilt into the shape the contract publishes. */
function toDraw(
	row: typeof materialDraws.$inferSelect,
	items: (typeof materialDrawItems.$inferSelect)[]
): Draw {
	return {
		contractVersion: '1',
		drawId: row.drawId,
		protocolRevision: row.protocolRevision,
		materialRelease: {
			sourceId: row.materialSourceId,
			revision: row.materialRelease,
			poolRevision: row.poolRevision
		},
		language: row.language,
		generation: {
			seed: row.seed,
			options: JSON.parse(row.options) as Record<string, unknown>,
			phonemeBalanceDistance: Number(row.phonemeBalanceDistance),
			// Read from the row rather than from the registry: replaying a draw must
			// report the tolerance it was actually judged against, even if the
			// revision were ever republished with another one.
			phonemeBalanceTolerance: Number(row.phonemeBalanceTolerance ?? 0)
		},
		items: items
			.sort((left, right) => left.position - right.position)
			.map((item) => ({
				itemId: item.itemId,
				itemRevision: item.itemRevision,
				// The text this draw served, not whatever the sentence says today.
				text: item.text,
				homonyms: []
			})),
		issuedAt: row.issuedAt.getTime()
	};
}

export function createDrawRepository(database: Database = db): DrawRepository {
	return {
		async findByIdempotencyKey(key: string): Promise<StoredDraw | null> {
			const [entry] = await database
				.select()
				.from(materialIdempotency)
				.where(eq(materialIdempotency.idempotencyKey, key))
				.limit(1);
			if (entry === undefined) return null;
			// A lapsed entry is not a conflict and not a replay: it is gone, and the
			// caller gets a fresh draw.
			if (entry.expiresAt.getTime() <= Date.now()) return null;

			const [row] = await database
				.select()
				.from(materialDraws)
				.where(eq(materialDraws.drawId, entry.drawId))
				.limit(1);
			if (row === undefined) return null;

			const items = await database
				.select()
				.from(materialDrawItems)
				.where(eq(materialDrawItems.drawId, entry.drawId));
			return { fingerprint: entry.fingerprint, draw: toDraw(row, items) };
		},

		async resolveExcludedItems(drawIds: readonly string[]): Promise<string[]> {
			if (drawIds.length === 0) return [];
			const rows = await database
				.select({
					itemId: materialDrawItems.itemId,
					itemRevision: materialDrawItems.itemRevision
				})
				.from(materialDrawItems)
				.where(inArray(materialDrawItems.drawId, [...drawIds]));
			// The union of the identities, not of the identifiers: a new draw that
			// reused one of these sentences would not be a rotation.
			return [...new Set(rows.map(itemIdentityKey))];
		},

		async persist(draw: Draw, idempotencyKey: string, fingerprint: string): Promise<void> {
			const expiresAt = new Date(draw.issuedAt + IDEMPOTENCY_RETENTION_DAYS * 24 * 60 * 60 * 1000);
			// One transaction: a draw whose items were not written cannot be
			// resolved, and a ledger entry pointing at a draw that does not exist
			// would replay into nothing.
			//
			// `batch` rather than `transaction`: the application runs on Neon's HTTP
			// driver, which has no interactive transactions and throws on
			// `.transaction()`. A batch is sent as a single request and committed as
			// one unit server-side, which is the atomicity this needs — the three
			// statements are known up front and none reads what the previous wrote.
			await database.batch([
				database.insert(materialDraws).values({
					drawId: draw.drawId,
					protocolRevision: draw.protocolRevision,
					materialSourceId: draw.materialRelease.sourceId,
					materialRelease: draw.materialRelease.revision,
					poolRevision: draw.materialRelease.poolRevision,
					language: draw.language,
					seed: draw.generation.seed,
					options: JSON.stringify(draw.generation.options),
					phonemeBalanceDistance: String(draw.generation.phonemeBalanceDistance),
					phonemeBalanceTolerance: String(draw.generation.phonemeBalanceTolerance),
					issuedAt: new Date(draw.issuedAt)
				}),
				database.insert(materialDrawItems).values(
					draw.items.map((item, position) => ({
						drawId: draw.drawId,
						position,
						itemId: item.itemId,
						itemRevision: item.itemRevision,
						text: item.text,
						sentenceId: Number(item.itemId)
					}))
				),
				database
					.insert(materialIdempotency)
					.values({ idempotencyKey, fingerprint, drawId: draw.drawId, expiresAt })
			]);
		}
	};
}
