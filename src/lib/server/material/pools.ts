/**
 * Describing the whole pool a protocol revision draws from.
 *
 * A draw answers "which sentences for this session"; a pool answers "which
 * sentences could any session get, and what are they made of". The second is
 * what a consumer needs to study its material: to model how difficult each
 * sentence is from its words, to simulate sessions on the real universe rather
 * than a synthetic one, and to check that a draw is a sample of it.
 *
 * Three rules, each the same as a draw's so the two never describe different
 * universes:
 *
 * - The pool is named by a **protocol revision**, never by filters. The
 *   revision fixes the language, the pattern, the density and the pool
 *   revision, exactly as it does for a draw.
 * - It lists exactly the sentences a draw can serve: `describePool` applies the
 *   draw's filters and its drawability rule.
 * - An item is identified as a draw identifies it — `itemId` and an
 *   `itemRevision` derived from the text — so an item in a pool and the same
 *   item in a draw are recognisably one.
 *
 * Unlike a draw, a pool is not persisted: it carries no seed and records no
 * session, and its `poolDigest` says which set of items was described.
 */

import { describePool, type PoolEntry, type PoolToken } from '@genlexis/core';
import { CONTRACT_VERSION } from './draws';
import { itemIdentityKey, itemRevisionOf, sha256Hex } from './fingerprint';
import { resolveProtocolRevision, type ProtocolConfiguration } from './registry';

/** Every closed error describing a pool can end in. */
export type PoolErrorCode =
	'unknown_protocol_revision' | 'corpus_unavailable' | 'service_unavailable';

export class PoolError extends Error {
	readonly code: PoolErrorCode;

	constructor(code: PoolErrorCode, message?: string) {
		super(message ?? code);
		this.name = 'PoolError';
		this.code = code;
	}
}

/** One sentence of the pool, as the contract publishes it. */
export interface PoolItem {
	itemId: string;
	itemRevision: string;
	text: string;
	homonyms: string[];
	/**
	 * The unit a uniform draw samples: one variant per pair, chosen by the seed.
	 * Items sharing a `pairKey` are never in the same draw.
	 */
	pairKey: string;
	tokens: PoolToken[];
}

/** The filters the revision fixes, as the contract publishes them. */
export interface PoolFilters {
	pattern: ProtocolConfiguration['pattern'];
	lexicalDensity: ProtocolConfiguration['lexicalDensity'];
	detType?: NonNullable<ProtocolConfiguration['detType']>;
	gender?: NonNullable<ProtocolConfiguration['gender']>;
	grammNumber?: NonNullable<ProtocolConfiguration['grammNumber']>;
	lengthUnit?: NonNullable<ProtocolConfiguration['lengthUnit']>;
	length?: number;
}

export interface Pool {
	contractVersion: typeof CONTRACT_VERSION;
	protocolRevision: string;
	materialRelease: { sourceId: string; revision: string; poolRevision: string };
	language: string;
	filters: PoolFilters;
	/**
	 * SHA-256 over the sorted `itemId@itemRevision` lines, one per item, each
	 * ended by `\n`. The pool revision is declared; this is measured — two pools
	 * with the same digest list the same items.
	 */
	poolDigest: string;
	items: PoolItem[];
	issuedAt: number;
}

export interface PoolDependencies {
	/** The repository the core reads the pool through. */
	repository: Parameters<typeof describePool>[1];
	/** The pool description; defaults to the core's. */
	describe?: typeof describePool;
	now?: () => number;
}

/** Only the filters the revision sets: an absent filter is not a filter that matched nothing. */
function filtersOf(configuration: ProtocolConfiguration): PoolFilters {
	const filters: PoolFilters = {
		pattern: configuration.pattern,
		lexicalDensity: configuration.lexicalDensity
	};
	if (configuration.detType !== undefined) filters.detType = configuration.detType;
	if (configuration.gender !== undefined) filters.gender = configuration.gender;
	if (configuration.grammNumber !== undefined) filters.grammNumber = configuration.grammNumber;
	if (configuration.length !== undefined) {
		filters.length = configuration.length;
		filters.lengthUnit = configuration.lengthUnit ?? 'syllables';
	}
	return filters;
}

async function toItem(entry: PoolEntry): Promise<PoolItem> {
	return {
		itemId: String(entry.sentenceId),
		itemRevision: await itemRevisionOf(entry.sentence),
		text: entry.sentence,
		homonyms: [],
		pairKey: entry.dedupeKey,
		tokens: entry.tokens
	};
}

/** The digest of a set of items: independent of their order. */
export async function poolDigestOf(
	items: readonly { itemId: string; itemRevision: string }[]
): Promise<string> {
	const lines = items.map((item) => `${itemIdentityKey(item)}\n`).sort();
	return sha256Hex(lines.join(''));
}

/**
 * Describes the pool of a protocol revision.
 *
 * @throws {PoolError} with the closed code the contract names.
 */
export async function describeProtocolPool(
	protocolRevision: string,
	dependencies: PoolDependencies
): Promise<Pool> {
	const configuration = resolveProtocolRevision(protocolRevision);
	if (configuration === null) throw new PoolError('unknown_protocol_revision');

	const filters = filtersOf(configuration);
	const describe = dependencies.describe ?? describePool;
	let entries: PoolEntry[];
	try {
		entries = await describe(
			{
				language: configuration.language,
				pattern: configuration.pattern,
				lexicalDensity: configuration.lexicalDensity,
				detType: configuration.detType,
				gender: configuration.gender,
				grammNumber: configuration.grammNumber,
				lengthUnit: configuration.length === undefined ? undefined : configuration.lengthUnit,
				length: configuration.length
			},
			dependencies.repository
		);
	} catch (cause) {
		// The core reports a missing distribution by message, as it does to a draw.
		if (cause instanceof Error && cause.message.startsWith('No phoneme distribution'))
			throw new PoolError('corpus_unavailable');
		throw cause;
	}
	if (entries.length === 0) throw new PoolError('corpus_unavailable');

	const items = await Promise.all(entries.map(toItem));
	return {
		contractVersion: CONTRACT_VERSION,
		protocolRevision,
		materialRelease: {
			sourceId: configuration.materialSourceId,
			revision: configuration.materialRelease,
			poolRevision: configuration.poolRevision
		},
		language: configuration.language,
		filters,
		poolDigest: await poolDigestOf(items),
		items,
		issuedAt: (dependencies.now ?? Date.now)()
	};
}
