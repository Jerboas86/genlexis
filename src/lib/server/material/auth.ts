/**
 * Authenticating the server-to-server draw endpoint.
 *
 * Two independent checks, and both must pass. The bearer proves the caller holds
 * the shared secret; the HMAC signature proves *this* request is the one they
 * meant to send, over a canonical form that pins the method, the path, a
 * timestamp and the exact body. A bearer alone would let a captured request be
 * replayed against a different path or with an edited body.
 *
 * Two secrets are accepted at once, so a rotation never has a gap: the new
 * secret is published as `next` while the old one still verifies, then the pair
 * is collapsed. Neither ever reaches a browser — this endpoint is not called
 * from one.
 */

const encoder = new TextEncoder();

/** How far a request's timestamp may be from ours before it is stale. */
export const MAX_CLOCK_SKEW_SECONDS = 300;

export interface MaterialCredentials {
	/** The bearer the caller must present. */
	token: string;
	/** Accepted during a rotation, when set. */
	previousToken?: string;
	/** The HMAC key over the canonical request. */
	signingSecret: string;
	previousSigningSecret?: string;
}

export type AuthFailure = 'missing' | 'bad_token' | 'bad_signature' | 'stale';

export type AuthResult = { ok: true } | { ok: false; reason: AuthFailure };

/**
 * The bytes the signature covers.
 *
 * The body is signed **verbatim** rather than re-serialised: re-encoding it here
 * would compare a normalised form against a signature taken over the original,
 * and any difference in key order or spacing would fail for the wrong reason.
 */
export function canonicalRequest(
	method: string,
	path: string,
	timestamp: number,
	body: string
): string {
	return [method.toUpperCase(), path, String(timestamp), body].join('\n');
}

async function sign(secret: string, message: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Constant-time comparison, so a verifier cannot be used as an oracle. */
function equal(left: string, right: string): boolean {
	if (left.length !== right.length) return false;
	let difference = 0;
	for (let index = 0; index < left.length; index += 1)
		difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
	return difference === 0;
}

function bearerFrom(headers: Headers): string | null {
	const header = headers.get('Authorization');
	if (header === null) return null;
	const [scheme, value] = header.split(' ');
	if (scheme?.toLowerCase() !== 'bearer' || !value) return null;
	return value;
}

/**
 * Verifies one request.
 *
 * Returns a named failure rather than a boolean so the caller can decide what to
 * log — but every failure becomes the same `401` on the wire, because telling an
 * unauthenticated caller *which* check failed is telling them how to get closer.
 *
 * @param body - The raw body as it arrived, before parsing.
 * @param now - Seconds since the epoch, injected so the skew window is testable.
 */
export async function verifyRequest(
	credentials: MaterialCredentials,
	request: { method: string; path: string; headers: Headers },
	body: string,
	now: number
): Promise<AuthResult> {
	const bearer = bearerFrom(request.headers);
	const timestampHeader = request.headers.get('X-Genlexis-Timestamp');
	const signature = request.headers.get('X-Genlexis-Signature');
	if (bearer === null || timestampHeader === null || signature === null)
		return { ok: false, reason: 'missing' };

	const accepted = [credentials.token, credentials.previousToken].filter(
		(value): value is string => typeof value === 'string' && value.length > 0
	);
	if (!accepted.some((value) => equal(value, bearer))) return { ok: false, reason: 'bad_token' };

	const timestamp = Number(timestampHeader);
	if (!Number.isFinite(timestamp)) return { ok: false, reason: 'stale' };
	// A signature with no freshness bound is a signature that can be replayed
	// forever, which is the one thing signing the body does not fix on its own.
	if (Math.abs(now - timestamp) > MAX_CLOCK_SKEW_SECONDS) return { ok: false, reason: 'stale' };

	const message = canonicalRequest(request.method, request.path, timestamp, body);
	const secrets = [credentials.signingSecret, credentials.previousSigningSecret].filter(
		(value): value is string => typeof value === 'string' && value.length > 0
	);
	// A misconfigured deployment with no usable secret refuses every request
	// rather than raising a crypto error out of the handler: `importKey` rejects
	// a zero-length key, and a 500 would say far more than a 401 does.
	for (const secret of secrets) {
		if (equal(await sign(secret, message), signature)) return { ok: true };
	}
	return { ok: false, reason: 'bad_signature' };
}
