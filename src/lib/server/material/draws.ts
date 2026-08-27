/**
 * Producing one draw.
 *
 * The rules that make a draw trustworthy live here, and the database access they
 * need is injected, so every one of them is testable without a connection.
 *
 * Four of them are worth naming, because each exists to stop a specific way the
 * material could quietly stop meaning what it claims:
 *
 * - A revision resolves to a frozen configuration. A caller cannot vary the
 *   condition, so one protocol identity cannot designate two conditions.
 * - An excluded draw excludes **every item it contained**, not merely its
 *   identifier. A new `drawId` that reused a recent sentence would not be a
 *   rotation.
 * - The result is persisted **before** it is returned. A draw the caller holds
 *   and the service has forgotten cannot be resolved, and rotation depends on
 *   resolving it.
 * - Exhausting the attempts is `pool_exhausted`. Shrinking the caller's rotation
 *   window to make a draw fit would weaken a guarantee that is theirs to set.
 */

import { generateBalancedAcceptedSentences, type AcceptedSentence } from '@genlexis/core';
import {
	canonicaliseExclusions,
	createDrawId,
	itemIdentityKey,
	itemRevisionOf,
	requestFingerprint
} from './fingerprint';
import { resolveProtocolRevision, type ProtocolConfiguration } from './registry';

export const CONTRACT_VERSION = '1';

/** Every closed error this service can answer with. */
export type DrawErrorCode =
	| 'unsupported_contract_version'
	| 'invalid_request'
	| 'idempotency_conflict'
	| 'unknown_protocol_revision'
	| 'pool_exhausted'
	| 'balance_tolerance_exceeded'
	| 'incomplete_draw'
	| 'corpus_unavailable'
	| 'service_unavailable';

export class DrawError extends Error {
	readonly code: DrawErrorCode;

	constructor(code: DrawErrorCode, message?: string) {
		super(message ?? code);
		this.name = 'DrawError';
		this.code = code;
	}
}

export interface DrawItem {
	itemId: string;
	itemRevision: string;
	text: string;
	homonyms: string[];
}

export interface Draw {
	contractVersion: typeof CONTRACT_VERSION;
	drawId: string;
	protocolRevision: string;
	materialRelease: { sourceId: string; revision: string; poolRevision: string };
	language: string;
	generation: {
		seed: string;
		options: Record<string, unknown>;
		phonemeBalanceDistance: number;
		phonemeBalanceTolerance: number;
	};
	items: DrawItem[];
	issuedAt: number;
}

/** One stored draw, as the ledger replays it. */
export interface StoredDraw {
	fingerprint: string;
	draw: Draw;
}

/**
 * What the orchestration needs from the database.
 *
 * Injected rather than imported so the rules above can be tested against an
 * in-memory double that behaves the same way. The real implementation is in
 * `drawsRepository.ts`.
 */
export interface DrawRepository {
	/** The stored result for a key, or `null`. */
	findByIdempotencyKey(key: string): Promise<StoredDraw | null>;
	/** The `(itemId, itemRevision)` union of the named draws. */
	resolveExcludedItems(drawIds: readonly string[]): Promise<string[]>;
	/** Persists the draw, its items and the ledger entry in one transaction. */
	persist(draw: Draw, idempotencyKey: string, fingerprint: string): Promise<void>;
}

export interface DrawRequest {
	contractVersion: string;
	protocolRevision: string;
	idempotencyKey: string;
	excludedDrawIds: readonly string[];
}

/** The engine call, injected so the orchestration can be tested without a pool. */
export type BalancedGenerator = typeof generateBalancedAcceptedSentences;

export interface DrawDependencies {
	repository: DrawRepository;
	generate?: BalancedGenerator;
	/** The `GenerationRepository` the engine draws against. */
	generationRepository: Parameters<BalancedGenerator>[1];
	now?: () => number;
	newDrawId?: () => string;
	newSeed?: (attempt: number) => string;
}

function optionsFor(configuration: ProtocolConfiguration): Record<string, unknown> {
	// Only the keys the contract publishes, and only when set: an `undefined`
	// serialised as `null` would read as a filter that was applied and matched
	// nothing.
	const options: Record<string, unknown> = {
		pattern: configuration.pattern,
		lexicalDensity: configuration.lexicalDensity,
		itemsPerList: configuration.itemsPerList,
		listCount: 1
	};
	if (configuration.detType !== undefined) options.detType = configuration.detType;
	if (configuration.gender !== undefined) options.gender = configuration.gender;
	if (configuration.grammNumber !== undefined) options.grammNumber = configuration.grammNumber;
	if (configuration.length !== undefined) {
		options.length = configuration.length;
		options.lengthUnit = configuration.lengthUnit ?? 'syllables';
	}
	return options;
}

async function toItems(sentences: readonly AcceptedSentence[]): Promise<DrawItem[]> {
	return Promise.all(
		sentences.map(async (sentence) => ({
			itemId: String(sentence.sentenceId),
			// Derived from the text, so a correction is a new revision by
			// construction rather than by anyone remembering to bump a column.
			itemRevision: await itemRevisionOf(sentence.sentence),
			text: sentence.sentence,
			homonyms: []
		}))
	);
}

/**
 * Produces or replays one draw.
 *
 * @throws {DrawError} with the closed code the contract names.
 */
export async function createDraw(
	request: DrawRequest,
	dependencies: DrawDependencies
): Promise<Draw> {
	if (request.contractVersion !== CONTRACT_VERSION)
		throw new DrawError('unsupported_contract_version');

	const configuration = resolveProtocolRevision(request.protocolRevision);
	if (configuration === null) throw new DrawError('unknown_protocol_revision');

	const excludedDrawIds = canonicaliseExclusions(request.excludedDrawIds);
	const fingerprint = await requestFingerprint(
		CONTRACT_VERSION,
		request.protocolRevision,
		excludedDrawIds
	);

	// Replay before anything else. A retry after a lost response must land on the
	// draw already made, not consume a second one from the pool.
	const stored = await dependencies.repository.findByIdempotencyKey(request.idempotencyKey);
	if (stored !== null) {
		if (stored.fingerprint !== fingerprint) throw new DrawError('idempotency_conflict');
		return stored.draw;
	}

	const forbidden = new Set(await dependencies.repository.resolveExcludedItems(excludedDrawIds));
	const generate = dependencies.generate ?? generateBalancedAcceptedSentences;
	const now = dependencies.now ?? Date.now;
	const newSeed = dependencies.newSeed ?? ((attempt: number) => `${createDrawId()}-${attempt}`);
	const options = optionsFor(configuration);

	// The three refusals below are different failures and must not collapse into
	// one: a pool that cannot fill a list at all is not a rotation that emptied
	// it, and neither is a list that came out phonemically unmatched.
	let anyFullLength = false;
	let lastDistance: number | null = null;
	for (let attempt = 0; attempt < configuration.maxDrawAttempts; attempt += 1) {
		const seed = newSeed(attempt);
		const result = await generate(
			{
				language: configuration.language,
				pattern: configuration.pattern,
				lexicalDensity: configuration.lexicalDensity,
				detType: configuration.detType,
				gender: configuration.gender,
				grammNumber: configuration.grammNumber,
				lengthUnit: configuration.length === undefined ? undefined : configuration.lengthUnit,
				length: configuration.length,
				listCount: 1,
				itemsPerList: configuration.itemsPerList,
				seed
			},
			dependencies.generationRepository
		);

		const sentences = result.lists[0] ?? [];
		// An early attempt may simply have drawn badly; only never managing a full
		// list means the pool cannot serve this revision.
		if (sentences.length < configuration.itemsPerList) continue;
		anyFullLength = true;

		const items = await toItems(sentences);
		// A new drawId that reuses one recent sentence is not a rotation.
		if (items.some((item) => forbidden.has(itemIdentityKey(item)))) continue;

		lastDistance = result.scores[0] ?? result.aggregateScore;
		if (lastDistance > configuration.phonemeBalanceTolerance) continue;

		const draw: Draw = {
			contractVersion: CONTRACT_VERSION,
			drawId: (dependencies.newDrawId ?? createDrawId)(),
			protocolRevision: request.protocolRevision,
			materialRelease: {
				sourceId: configuration.materialSourceId,
				revision: configuration.materialRelease,
				poolRevision: configuration.poolRevision
			},
			language: configuration.language,
			generation: {
				seed,
				options,
				phonemeBalanceDistance: lastDistance,
				phonemeBalanceTolerance: configuration.phonemeBalanceTolerance
			},
			items,
			issuedAt: now()
		};

		// Persisted before it is returned. A draw the caller holds and the service
		// has forgotten cannot be resolved, and every later rotation depends on
		// resolving it.
		await dependencies.repository.persist(draw, request.idempotencyKey, fingerprint);
		return draw;
	}

	// Each of these is an honest refusal, and none may be repaired by narrowing
	// the caller's rotation window or by relaxing the tolerance the revision
	// published.
	if (!anyFullLength) throw new DrawError('incomplete_draw');
	if (lastDistance !== null && lastDistance > configuration.phonemeBalanceTolerance)
		throw new DrawError('balance_tolerance_exceeded');
	throw new DrawError('pool_exhausted');
}
