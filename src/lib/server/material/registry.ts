/**
 * The immutable registry of protocol revisions.
 *
 * A consumer asks for material by naming a revision, never by passing clinical
 * generation parameters. That is the whole point: if a caller could choose the
 * pattern, the density or the item count, then one protocol identity could
 * designate two different conditions, and two sessions recorded under the same
 * name would not be comparable.
 *
 * There is deliberately **no implicit "latest"**. Changing the pool or the
 * generation policy means publishing a new entry here and a new revision
 * identifier; an unpublished revision is refused rather than approximated.
 *
 * Entries are frozen. Editing one in place would retroactively change what every
 * session already recorded under it claims to have measured — which is exactly
 * the silent reinterpretation the whole design exists to prevent. Add a new
 * revision instead.
 */

import type {
	DetType,
	Gender,
	GrammNumber,
	LengthUnit,
	LexicalDensity,
	SupportedPattern
} from '@genlexis/core';

/** Everything a revision fixes. Nothing here may be overridden per request. */
export interface ProtocolConfiguration {
	/** The material source, as the record cites it. Never a Voxa `corpusId`. */
	materialSourceId: string;
	/** The immutable release revision. A correction publishes a new one. */
	materialRelease: string;
	/**
	 * The accepted pool this revision draws against.
	 *
	 * Declared rather than computed, and that is a commitment by whoever
	 * published the revision: it asserts that the pool behind this identifier
	 * does not change. Publishing new material means a new pool revision and a
	 * new protocol revision, not an edit here.
	 */
	poolRevision: string;
	language: string;
	pattern: SupportedPattern;
	lexicalDensity: LexicalDensity;
	itemsPerList: number;
	detType?: DetType;
	gender?: Gender;
	grammNumber?: GrammNumber;
	lengthUnit?: LengthUnit;
	length?: number;
	/**
	 * The largest phoneme-balance distance a draw may have and still be served.
	 *
	 * A draw above it is refused with `balance_tolerance_exceeded` rather than
	 * returned with a warning: a list that is not phonemically matched is not the
	 * instrument this revision names.
	 */
	phonemeBalanceTolerance: number;
	/**
	 * How many draws to attempt before giving up on the exclusions.
	 *
	 * Each attempt uses a fresh seed. Exhausting them is `pool_exhausted`, which
	 * is an honest refusal — the alternative would be to shrink the caller's
	 * rotation window, which is theirs to set and not ours to weaken.
	 */
	maxDrawAttempts: number;
}

/**
 * The published revisions.
 *
 * `as const` and frozen at the bottom of the file so a caller cannot mutate a
 * configuration it was handed.
 */
const REVISIONS: Readonly<Record<string, ProtocolConfiguration>> = {
	'genlexis-fr-np-verb-r1': {
		materialSourceId: 'genlexis-fr',
		materialRelease: 'r1',
		// The corpus this revision draws against, now complete: every generated
		// `np_verb` sentence has been judged, leaving 1924 accepted at medium density
		// in production. The label moves with the corpus, because a draw replayed
		// against a different pool is not the same measurement even under the same
		// seed — `poolRevision` is part of the protocol's identity, not a comment.
		poolRevision: 'pool-2026-09-11',
		language: 'fr-FR',
		pattern: 'np_verb',
		lexicalDensity: 'medium',
		itemsPerList: 20,
		// Measured against the finished corpus, and measured at the case that binds.
		//
		// The tempting reference is a fresh draw, and it is the wrong one: the service
		// must also serve the fourth session, which avoids the three before it, and
		// that is where the balancer works hardest. Over 40 draws at each depth
		// (1772 drawable sentences, 2026-09-11):
		//
		//   excluded draws   p50     p90     worst
		//   0                0.0829  0.0956  0.1042
		//   1                0.0865  0.1049  0.1116
		//   2                0.0876  0.1055  0.1079
		//   3                0.0972  0.1126  0.1228
		//
		// 0.13 sits above every one of the 160 draws observed, the worst being 0.1228,
		// leaving about 6% of margin. That margin is deliberate rather than timid: the
		// corpus can shrink as human votes contradict the judge — production and dev
		// already differ by 11 sentences for exactly that reason — and a shrinking
		// corpus pushes these distances back up. A tolerance that refused 2% of draws
		// today would refuse more later, and this value cannot be revisited.
		//
		// It cannot be revisited because it is hashed into the protocol's identity on
		// the consumer's side, and two sessions are comparable only when those hashes
		// match. Changing it would sever every patient's baseline from their own
		// follow-ups. The earlier values — 0.08, then 0.16 — could be corrected in
		// place only because nothing had ever consumed them.
		//
		// §16 (9) of `listening-conditions.md` still owns the clinical figure; this is
		// what the material delivers, not what the instrument should ultimately
		// require.
		phonemeBalanceTolerance: 0.13,
		maxDrawAttempts: 8
	}
};

for (const configuration of Object.values(REVISIONS)) Object.freeze(configuration);
Object.freeze(REVISIONS);

/** Every published revision, for diagnostics and tests. */
export const PUBLISHED_REVISIONS: readonly string[] = Object.freeze(Object.keys(REVISIONS));

/**
 * Resolves a revision, or `null` when it was never published.
 *
 * `null` rather than a thrown error, and rather than a default: the caller turns
 * it into `unknown_protocol_revision`, and there is no configuration it could
 * sensibly fall back to.
 */
export function resolveProtocolRevision(revision: string): ProtocolConfiguration | null {
	return Object.hasOwn(REVISIONS, revision) ? REVISIONS[revision]! : null;
}
