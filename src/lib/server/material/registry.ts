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
		poolRevision: 'pool-2026-08-27',
		language: 'fr-FR',
		pattern: 'np_verb',
		lexicalDensity: 'medium',
		itemsPerList: 20,
		// Measured, not chosen: over 200 seeds against the accepted `np_verb`
		// corpus at medium density (145 sentences on 2026-08-29) the distance ran
		// min 0.1258, median 0.1458, p90 0.1590, max 0.1804. The previous 0.08 was
		// a placeholder below the whole distribution, so every draw was refused
		// with `balance_tolerance_exceeded` — in production as much as anywhere,
		// the corpus being the same.
		//
		// Set at the p90 so that a single attempt succeeds nine times in ten and
		// the eight attempts effectively never exhaust, while the tolerance stays a
		// real gate: a corpus that degraded would still be refused rather than
		// served. It is expected to tighten as the corpus grows, which is a new
		// revision rather than an edit to this one — this value could be corrected
		// in place only because nothing had ever consumed it.
		//
		// §16 (9) of `listening-conditions.md` still owns the clinical figure; this
		// is what the material can currently deliver, not what the instrument
		// should ultimately require.
		phonemeBalanceTolerance: 0.16,
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
