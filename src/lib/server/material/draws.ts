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

import {
	generateBalancedAcceptedSentences,
	generateUniformAcceptedSentences,
	type AcceptedSentence
} from '@genlexis/core';
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
		selection: 'balanced' | 'uniform';
		phonemeBalanceDistance: number;
		/** `null` exactly when `selection` is `uniform`. */
		phonemeBalanceTolerance: number | null;
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
	/** The balanced selection; defaults to the engine's. */
	generate?: BalancedGenerator;
	/** The uniform selection; defaults to the engine's. */
	generateUniform?: BalancedGenerator;
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

/** The selection a revision names, from the injected engine or the real one. */
function generatorFor(
	configuration: ProtocolConfiguration,
	dependencies: DrawDependencies
): BalancedGenerator {
	return configuration.selection === 'uniform'
		? (dependencies.generateUniform ?? generateUniformAcceptedSentences)
		: (dependencies.generate ?? generateBalancedAcceptedSentences);
}

/** What the engine is asked for: the revision's fixed parameters, the exclusions and a seed. */
function engineOptions(
	configuration: ProtocolConfiguration,
	excludedSentenceIds: number[],
	seed: string
): Parameters<BalancedGenerator>[0] {
	return {
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
		excludedSentenceIds,
		seed
	};
}

/** How one attempt went: a servable list, or the reason it is not one. */
type Attempt =
	| { kind: 'short' }
	| { kind: 'overlap' }
	| { kind: 'unbalanced'; distance: number }
	| { kind: 'servable'; items: DrawItem[]; distance: number };

/** Judges one engine result against the revision and the exclusions. */
async function judgeAttempt(
	result: Awaited<ReturnType<BalancedGenerator>>,
	configuration: ProtocolConfiguration,
	forbidden: ReadonlySet<string>
): Promise<Attempt> {
	const sentences = result.lists[0] ?? [];
	// An early attempt may simply have drawn badly; only never managing a full
	// list means the pool cannot serve this revision.
	if (sentences.length < configuration.itemsPerList) return { kind: 'short' };

	const items = await toItems(sentences);
	// A new drawId that reuses one recent sentence is not a rotation.
	if (items.some((item) => forbidden.has(itemIdentityKey(item)))) return { kind: 'overlap' };

	const distance = result.scores[0] ?? result.aggregateScore;
	// A uniform revision has no tolerance: its distance describes the list.
	const tolerance = configuration.phonemeBalanceTolerance;
	if (tolerance !== null && distance > tolerance) return { kind: 'unbalanced', distance };
	return { kind: 'servable', items, distance };
}

/**
 * The refusal once every attempt failed.
 *
 * The three are different failures and must not collapse into one: a pool that
 * cannot fill a list at all is not a rotation that emptied it, and neither is a
 * list that came out phonemically unmatched. None may be repaired by narrowing
 * the caller's rotation window or by relaxing the tolerance the revision
 * published.
 */
function refusalAfter(attempts: readonly Attempt[]): DrawError {
	if (attempts.every((attempt) => attempt.kind === 'short'))
		return new DrawError('incomplete_draw');
	if (attempts.some((attempt) => attempt.kind === 'unbalanced'))
		return new DrawError('balance_tolerance_exceeded');
	return new DrawError('pool_exhausted');
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
	// The identity keys are `itemId@itemRevision`, and the item id is the sentence
	// id. The engine is told the sentences so it never picks them; the identity
	// check stays as the backstop, because a sentence whose text changed is a
	// different revision and only the key can tell.
	const excludedSentenceIds = [...forbidden].map((key) => Number(key.split('@')[0]));
	const generate = generatorFor(configuration, dependencies);
	const newSeed = dependencies.newSeed ?? ((attempt: number) => `${createDrawId()}-${attempt}`);

	const attempts: Attempt[] = [];
	for (let index = 0; index < configuration.maxDrawAttempts; index += 1) {
		const seed = newSeed(index);
		const result = await generate(
			engineOptions(configuration, excludedSentenceIds, seed),
			dependencies.generationRepository
		);
		const attempt = await judgeAttempt(result, configuration, forbidden);
		attempts.push(attempt);
		if (attempt.kind !== 'servable') continue;

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
				options: optionsFor(configuration),
				selection: configuration.selection,
				phonemeBalanceDistance: attempt.distance,
				phonemeBalanceTolerance: configuration.phonemeBalanceTolerance
			},
			items: attempt.items,
			issuedAt: (dependencies.now ?? Date.now)()
		};

		// Persisted before it is returned. A draw the caller holds and the service
		// has forgotten cannot be resolved, and every later rotation depends on
		// resolving it.
		await dependencies.repository.persist(draw, request.idempotencyKey, fingerprint);
		return draw;
	}

	throw refusalAfter(attempts);
}
