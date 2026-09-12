import { lt } from 'drizzle-orm';
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { materialIdempotency } from '../db/schema';

/**
 * Drops lapsed ledger entries.
 *
 * The draws themselves stay: a `drawId` must keep resolving for the whole
 * transfer window, and it is the *replay* that expires, not the record of what
 * was served.
 *
 * Takes its connection rather than importing the application's: this runs from
 * the Worker's scheduled handler, outside any request, where `$env` does not
 * exist and the connection string comes from `env` directly. Nothing in this
 * module may import `$env` or `$lib`, or the Worker bundle stops building.
 */
export async function purgeExpiredIdempotency(
	database: NeonHttpDatabase<Record<string, unknown>>
): Promise<number> {
	const deleted = await database
		.delete(materialIdempotency)
		.where(lt(materialIdempotency.expiresAt, new Date()))
		.returning({ key: materialIdempotency.idempotencyKey });
	return deleted.length;
}
