import { describe, expect, it } from 'vitest';
import { canonicalRequest, MAX_CLOCK_SKEW_SECONDS, verifyRequest } from './auth';

const CREDENTIALS = { token: 'the-token', signingSecret: 'the-signing-secret' };
const NOW = 1_756_300_000;
const BODY = '{"contractVersion":"1"}';

const encoder = new TextEncoder();

async function signature(secret: string, message: string): Promise<string> {
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

async function headers(
	overrides: { token?: string; secret?: string; timestamp?: number; body?: string } = {}
): Promise<Headers> {
	const timestamp = overrides.timestamp ?? NOW;
	const body = overrides.body ?? BODY;
	return new Headers({
		Authorization: `Bearer ${overrides.token ?? CREDENTIALS.token}`,
		'X-Genlexis-Timestamp': String(timestamp),
		'X-Genlexis-Signature': await signature(
			overrides.secret ?? CREDENTIALS.signingSecret,
			canonicalRequest('POST', '/v1/draws', timestamp, body)
		)
	});
}

const request = (headers: Headers) => ({ method: 'POST', path: '/v1/draws', headers });

describe('verifyRequest', () => {
	it('accepts a correctly signed request', async () => {
		const result = await verifyRequest(CREDENTIALS, request(await headers()), BODY, NOW);
		expect(result.ok).toBe(true);
	});

	it('refuses a request with no credentials at all', async () => {
		const result = await verifyRequest(CREDENTIALS, request(new Headers()), BODY, NOW);
		expect(result).toEqual({ ok: false, reason: 'missing' });
	});

	it('refuses a wrong bearer', async () => {
		const result = await verifyRequest(
			CREDENTIALS,
			request(await headers({ token: 'not-the-token' })),
			BODY,
			NOW
		);
		expect(result).toEqual({ ok: false, reason: 'bad_token' });
	});

	it('refuses a bearer sent under another scheme', async () => {
		const given = await headers();
		given.set('Authorization', `Basic ${CREDENTIALS.token}`);
		expect(await verifyRequest(CREDENTIALS, request(given), BODY, NOW)).toMatchObject({
			ok: false
		});
	});

	it('refuses a signature made with another secret', async () => {
		const result = await verifyRequest(
			CREDENTIALS,
			request(await headers({ secret: 'another-secret' })),
			BODY,
			NOW
		);
		expect(result).toEqual({ ok: false, reason: 'bad_signature' });
	});

	it('refuses a body that changed after it was signed', async () => {
		// The bearer alone would have accepted this. Signing the body is what
		// makes a captured request unusable with different contents.
		const result = await verifyRequest(
			CREDENTIALS,
			request(await headers()),
			'{"tampered":1}',
			NOW
		);
		expect(result).toEqual({ ok: false, reason: 'bad_signature' });
	});

	it('refuses a signature replayed against another path', async () => {
		const given = await headers();
		const result = await verifyRequest(
			CREDENTIALS,
			{ method: 'POST', path: '/v1/something-else', headers: given },
			BODY,
			NOW
		);
		expect(result).toEqual({ ok: false, reason: 'bad_signature' });
	});

	it('refuses a signature replayed under another method', async () => {
		const given = await headers();
		const result = await verifyRequest(
			CREDENTIALS,
			{ method: 'DELETE', path: '/v1/draws', headers: given },
			BODY,
			NOW
		);
		expect(result).toEqual({ ok: false, reason: 'bad_signature' });
	});

	it('refuses a stale request, so a captured one cannot be replayed forever', async () => {
		const given = await headers({ timestamp: NOW - MAX_CLOCK_SKEW_SECONDS - 1 });
		expect(await verifyRequest(CREDENTIALS, request(given), BODY, NOW)).toEqual({
			ok: false,
			reason: 'stale'
		});
	});

	it('refuses a request dated too far in the future', async () => {
		const given = await headers({ timestamp: NOW + MAX_CLOCK_SKEW_SECONDS + 1 });
		expect(await verifyRequest(CREDENTIALS, request(given), BODY, NOW)).toEqual({
			ok: false,
			reason: 'stale'
		});
	});

	it('tolerates clock skew inside the published window', async () => {
		for (const offset of [-MAX_CLOCK_SKEW_SECONDS, 0, MAX_CLOCK_SKEW_SECONDS]) {
			const given = await headers({ timestamp: NOW + offset });
			expect(await verifyRequest(CREDENTIALS, request(given), BODY, NOW)).toEqual({ ok: true });
		}
	});

	it('refuses a non-numeric timestamp', async () => {
		const given = await headers();
		given.set('X-Genlexis-Timestamp', 'yesterday');
		expect(await verifyRequest(CREDENTIALS, request(given), BODY, NOW)).toMatchObject({
			ok: false
		});
	});
});

describe('credential rotation', () => {
	const rotating = {
		token: 'new-token',
		previousToken: 'old-token',
		signingSecret: 'new-secret',
		previousSigningSecret: 'old-secret'
	};

	it('accepts the new pair', async () => {
		const given = await headers({ token: 'new-token', secret: 'new-secret' });
		expect(await verifyRequest(rotating, request(given), BODY, NOW)).toEqual({ ok: true });
	});

	it('still accepts the previous pair, so a rotation has no gap', async () => {
		const given = await headers({ token: 'old-token', secret: 'old-secret' });
		expect(await verifyRequest(rotating, request(given), BODY, NOW)).toEqual({ ok: true });
	});

	it('accepts a caller mid-rotation, holding one new and one old half', async () => {
		const given = await headers({ token: 'new-token', secret: 'old-secret' });
		expect(await verifyRequest(rotating, request(given), BODY, NOW)).toEqual({ ok: true });
	});

	it('refuses a pair from neither generation', async () => {
		const given = await headers({ token: 'new-token', secret: 'ancient-secret' });
		expect(await verifyRequest(rotating, request(given), BODY, NOW)).toMatchObject({ ok: false });
	});

	it('does not treat the emptied previous fields as a wildcard', async () => {
		// Collapsing the pair leaves them as empty strings. They must be ignored
		// rather than tried, or every rotation would end by widening what verifies.
		const collapsed = { ...CREDENTIALS, previousToken: '', previousSigningSecret: '' };
		const given = await headers({ secret: 'some-other-secret' });
		expect(await verifyRequest(collapsed, request(given), BODY, NOW)).toEqual({
			ok: false,
			reason: 'bad_signature'
		});
	});

	it('refuses every request when no usable secret is configured at all', async () => {
		// A deployment with nothing set answers 401 rather than raising a crypto
		// error out of the handler — `importKey` rejects a zero-length key.
		const unset = { token: 'the-token', signingSecret: '' };
		expect(await verifyRequest(unset, request(await headers()), BODY, NOW)).toEqual({
			ok: false,
			reason: 'bad_signature'
		});
	});
});

describe('canonicalRequest', () => {
	it('pins the method, the path, the timestamp and the body', () => {
		expect(canonicalRequest('post', '/v1/draws', 42, '{}')).toBe('POST\n/v1/draws\n42\n{}');
	});

	it('separates the fields so two different requests cannot share a form', () => {
		expect(canonicalRequest('POST', '/a', 1, 'b')).not.toBe(
			canonicalRequest('POST', '/a', 1, 'b2')
		);
		expect(canonicalRequest('POST', '/a', 12, '')).not.toBe(canonicalRequest('POST', '/a', 1, '2'));
	});
});
