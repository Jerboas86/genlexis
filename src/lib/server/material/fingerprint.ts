/**
 * The canonical fingerprint of a draw request, and the identity of an item.
 *
 * Both are pure, and both decide whether two things are "the same" — which is
 * the kind of question that must never depend on incidental ordering or on who
 * remembered to bump a column.
 */

const encoder = new TextEncoder();

async function sha256Hex(value: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * The exclusions, sorted and de-duplicated.
 *
 * Two requests that differ only in the order they listed their exclusions are
 * the same request. Fingerprinting the raw array would turn a reordered retry
 * into an idempotency conflict, which would look to the caller like a bug in
 * their rotation rather than in ours.
 */
export function canonicaliseExclusions(drawIds: readonly string[]): string[] {
	return [...new Set(drawIds)].sort();
}

/**
 * What an idempotency key is bound to.
 *
 * The contract version, the protocol revision and the canonical exclusions —
 * and nothing else. The key itself is deliberately **not** part of it: the
 * fingerprint answers "is this the same request?", and the key answers "is this
 * the same operation?". Mixing them would make every key trivially match itself.
 */
export async function requestFingerprint(
	contractVersion: string,
	protocolRevision: string,
	excludedDrawIds: readonly string[]
): Promise<string> {
	// JSON of an array, so the three fields cannot run together: a revision
	// ending in a digit and an exclusion beginning with one would otherwise
	// concatenate into the same string as a different pair.
	return sha256Hex(
		JSON.stringify([contractVersion, protocolRevision, canonicaliseExclusions(excludedDrawIds)])
	);
}

/**
 * The revision of one item, derived from its text.
 *
 * Deriving it rather than storing it makes the contract's rule true by
 * construction: changing the text of an item creates a new revision, and no one
 * has to remember to say so. A sentence corrected after a draw cited it
 * therefore produces a *different* identity, and the old draw keeps naming
 * exactly what it served.
 *
 * Sixteen hex characters: enough that two distinct sentences colliding is not a
 * practical concern, short enough to read in a payload.
 */
export async function itemRevisionOf(sentence: string): Promise<string> {
	return (await sha256Hex(sentence)).slice(0, 16);
}

/** The single key under which two item identities are compared. */
export function itemIdentityKey(identity: { itemId: string; itemRevision: string }): string {
	return `${identity.itemId}@${identity.itemRevision}`;
}

/**
 * A fresh draw identifier.
 *
 * Opaque, random and non-derivable, because it is a linguistic reference: it
 * resolves to the exact sentences a session presented. A sequence would leak how
 * many draws exist and let one caller guess another's.
 */
export function createDrawId(): string {
	return [...crypto.getRandomValues(new Uint8Array(16))]
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
}
