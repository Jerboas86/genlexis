import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canonicalRequest } from '$lib/server/material/auth';
import { DrawError } from '$lib/server/material/draws';

/**
 * The route in front of the draw service: its gates, and its mapping of every
 * failure to the closed answer.
 *
 * `createDraw` and both repositories are doubled. The rules of a draw are
 * proven in `draws.spec.ts`; what this file owes is that a request reaches
 * them only through the gates the contract names — size, signature, shape —
 * and that nothing which goes wrong afterwards leaks past the closed codes.
 */

const TOKEN = 't'.repeat(32);
const SECRET = 's'.repeat(32);
const KEY = 'a'.repeat(64);
const DRAW_ID = 'b'.repeat(32);

const createDraw = vi.fn();
// The route reads its credentials from `$env/dynamic/private`, which the
// SvelteKit plugin fixes when vitest starts; stubbing `process.env` from inside
// a test comes too late. The module is doubled instead, and the values are
// the ones every signature below is made with.
vi.mock('$env/dynamic/private', () => ({
	env: {
		PRIVATE_MATERIAL_API_TOKEN: 't'.repeat(32),
		PRIVATE_MATERIAL_SIGNING_SECRET: 's'.repeat(32)
	}
}));
vi.mock('$lib/server/material/draws', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/material/draws')>()),
	createDraw: (...args: unknown[]) => createDraw(...args)
}));
vi.mock('$lib/server/material/drawsRepository', () => ({ createDrawRepository: () => ({}) }));
vi.mock('$lib/server/genlexis/repository', () => ({ repository: {} }));

const URL_ = 'https://genlexis.test/v1/draws';

/** A request signed the way a real caller signs it. */
function signed(body: string, { token = TOKEN, secret = SECRET } = {}): Request {
	const timestamp = Math.floor(Date.now() / 1000);
	const signature = createHmac('sha256', secret)
		.update(canonicalRequest('POST', '/v1/draws', timestamp, body))
		.digest('hex');
	return new Request(URL_, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`,
			'X-Genlexis-Timestamp': String(timestamp),
			'X-Genlexis-Signature': signature
		},
		body
	});
}

const valid = () => ({
	contractVersion: '1',
	protocolRevision: 'genlexis-fr-np-verb-r1',
	idempotencyKey: KEY,
	excludedDrawIds: []
});

async function post(request: Request) {
	const { POST } = await import('./+server');
	const response = await POST({ request, url: new URL(request.url) } as never);
	return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

describe('POST /v1/draws', () => {
	beforeEach(() => {
		vi.spyOn(console, 'log').mockImplementation(() => {});
		vi.spyOn(console, 'error').mockImplementation(() => {});
		createDraw.mockReset();
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('refuses an oversized body before reading anything else', async () => {
		const { status, body } = await post(signed('x'.repeat(64_001)));
		expect(status).toBe(400);
		expect(body).toEqual({ error: 'invalid_request' });
		expect(createDraw).not.toHaveBeenCalled();
	});

	it('refuses an unsigned request, and says only that', async () => {
		const request = new Request(URL_, { method: 'POST', body: JSON.stringify(valid()) });
		const { status, body } = await post(request);
		expect(status).toBe(401);
		expect(body).toEqual({ error: 'unauthorized' });
	});

	it('refuses a signature made with another secret', async () => {
		const { status } = await post(signed(JSON.stringify(valid()), { secret: 'x'.repeat(32) }));
		expect(status).toBe(401);
	});

	it.each<[string, unknown]>([
		['a body that is not JSON', '{'],
		['an array', [valid()]],
		['a field the contract does not name', { ...valid(), extra: 1 }],
		['a missing contract version', { ...valid(), contractVersion: undefined }],
		['a malformed protocol revision', { ...valid(), protocolRevision: '-bad' }],
		['a malformed idempotency key', { ...valid(), idempotencyKey: 'short' }],
		['exclusions that are not a list', { ...valid(), excludedDrawIds: 'nope' }],
		['a malformed excluded draw id', { ...valid(), excludedDrawIds: ['nope'] }],
		['too many exclusions', { ...valid(), excludedDrawIds: Array(65).fill(DRAW_ID) }]
	])('refuses %s', async (_name, payload) => {
		const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
		const { status, body: answer } = await post(signed(body));
		expect(status).toBe(400);
		expect(answer).toEqual({ error: 'invalid_request' });
		expect(createDraw).not.toHaveBeenCalled();
	});

	it('serves a draw, and records what it served without the key', async () => {
		const draw = {
			protocolRevision: 'genlexis-fr-np-verb-r1',
			materialRelease: { poolRevision: 'pool-x' },
			items: [{ text: 'Une phrase.' }],
			generation: { phonemeBalanceDistance: 0.1 }
		};
		createDraw.mockResolvedValue(draw);

		const { status, body } = await post(
			signed(JSON.stringify({ ...valid(), excludedDrawIds: [DRAW_ID] }))
		);

		expect(status).toBe(200);
		expect(body).toEqual(draw);
		expect(createDraw).toHaveBeenCalledWith(
			expect.objectContaining({ idempotencyKey: KEY, excludedDrawIds: [DRAW_ID] }),
			expect.anything()
		);
		// The log names the outcome and the counts, never the key or the ids.
		const logged = (console.log as ReturnType<typeof vi.fn>).mock.calls.map(String).join('\n');
		expect(logged).toContain('"event":"draw_served"');
		expect(logged).toContain('"excluded":1');
		expect(logged).not.toContain(KEY);
		expect(logged).not.toContain(DRAW_ID);
	});

	it.each<[string, Error, number, string]>([
		['a closed refusal', new DrawError('pool_exhausted'), 422, 'pool_exhausted'],
		['a conflict', new DrawError('idempotency_conflict'), 409, 'idempotency_conflict'],
		[
			'a missing distribution',
			new Error('No phoneme distribution found for language "xx"'),
			422,
			'corpus_unavailable'
		],
		['anything else', new TypeError('boom'), 503, 'service_unavailable']
	])('maps %s to its code', async (_name, cause, status, code) => {
		createDraw.mockRejectedValue(cause);
		const answer = await post(signed(JSON.stringify(valid())));
		expect(answer.status).toBe(status);
		expect(answer.body).toEqual({ error: code });
	});

	it('logs an unexpected failure by name and message, and nothing of the request', async () => {
		createDraw.mockRejectedValue(new TypeError('boom'));
		await post(signed(JSON.stringify(valid())));
		const logged = (console.error as ReturnType<typeof vi.fn>).mock.calls.map(String).join('\n');
		expect(logged).toContain('"event":"draw_failed"');
		expect(logged).toContain('"name":"TypeError"');
		expect(logged).toContain('"message":"boom"');
		expect(logged).not.toContain(KEY);
	});
});
