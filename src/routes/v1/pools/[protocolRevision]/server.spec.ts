import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canonicalRequest } from '$lib/server/material/auth';
import { PoolError } from '$lib/server/material/pools';

/**
 * The route in front of the pool description: its gates, and its mapping of
 * every failure to the closed answer. `describeProtocolPool` is doubled; its
 * rules are proven in `pools.spec.ts`.
 */

const TOKEN = 't'.repeat(32);
const SECRET = 's'.repeat(32);
const REVISION = 'genlexis-fr-np-verb-r2';

const describeProtocolPool = vi.fn();
vi.mock('$env/dynamic/private', () => ({
	env: {
		PRIVATE_MATERIAL_API_TOKEN: 't'.repeat(32),
		PRIVATE_MATERIAL_SIGNING_SECRET: 's'.repeat(32)
	}
}));
vi.mock('$lib/server/material/pools', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/material/pools')>()),
	describeProtocolPool: (...args: unknown[]) => describeProtocolPool(...args)
}));
vi.mock('$lib/server/genlexis/repository', () => ({ repository: {} }));

/** A request signed the way a real caller signs it: an empty body. */
function signed(path: string, { token = TOKEN, secret = SECRET, method = 'GET' } = {}): Request {
	const timestamp = Math.floor(Date.now() / 1000);
	const signature = createHmac('sha256', secret)
		.update(canonicalRequest(method, path, timestamp, ''))
		.digest('hex');
	return new Request(`https://genlexis.test${path}`, {
		method: 'GET',
		headers: {
			Authorization: `Bearer ${token}`,
			'X-Genlexis-Timestamp': String(timestamp),
			'X-Genlexis-Signature': signature
		}
	});
}

async function get(request: Request) {
	const { GET } = await import('./+server');
	const url = new URL(request.url);
	const protocolRevision = decodeURIComponent(url.pathname.split('/').at(-1) ?? '');
	const response = await GET({ request, url, params: { protocolRevision } } as never);
	return {
		status: response.status,
		headers: response.headers,
		body: (await response.json()) as Record<string, unknown>
	};
}

describe('GET /v1/pools/{protocolRevision}', () => {
	beforeEach(() => {
		vi.spyOn(console, 'log').mockImplementation(() => {});
		vi.spyOn(console, 'error').mockImplementation(() => {});
		describeProtocolPool.mockReset();
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('refuses an unsigned request, and says only that', async () => {
		const { status, body } = await get(new Request(`https://genlexis.test/v1/pools/${REVISION}`));
		expect(status).toBe(401);
		expect(body).toEqual({ error: 'unauthorized' });
		expect(describeProtocolPool).not.toHaveBeenCalled();
	});

	it('refuses a signature made for another path', async () => {
		// A pool request signed for r1 cannot be replayed against r2.
		const forR1 = signed('/v1/pools/genlexis-fr-np-verb-r1');
		const moved = new Request(`https://genlexis.test/v1/pools/${REVISION}`, {
			headers: forR1.headers
		});

		expect((await get(moved)).status).toBe(401);
		expect(describeProtocolPool).not.toHaveBeenCalled();
	});

	it('refuses a signature made for another method', async () => {
		expect((await get(signed(`/v1/pools/${REVISION}`, { method: 'POST' }))).status).toBe(401);
		expect(describeProtocolPool).not.toHaveBeenCalled();
	});

	it('refuses a malformed revision before describing anything', async () => {
		const { status, body } = await get(signed('/v1/pools/-bad'));
		expect(status).toBe(400);
		expect(body).toEqual({ error: 'invalid_request' });
		expect(describeProtocolPool).not.toHaveBeenCalled();
	});

	it('serves the pool, never cached', async () => {
		const pool = {
			protocolRevision: REVISION,
			materialRelease: { poolRevision: 'pool-x' },
			poolDigest: 'd'.repeat(64),
			items: [{ itemId: '1' }]
		};
		describeProtocolPool.mockResolvedValue(pool);

		const { status, headers, body } = await get(signed(`/v1/pools/${REVISION}`));

		expect(status).toBe(200);
		expect(headers.get('Cache-Control')).toBe('no-store');
		expect(body).toEqual(pool);
		expect(describeProtocolPool).toHaveBeenCalledWith(REVISION, expect.anything());
		const logged = (console.log as ReturnType<typeof vi.fn>).mock.calls.map(String).join('\n');
		expect(logged).toContain('"event":"pool_served"');
	});

	it.each([
		['unknown_protocol_revision', 422],
		['corpus_unavailable', 422]
	] as const)('answers %s with %i', async (code, expected) => {
		describeProtocolPool.mockRejectedValue(new PoolError(code));

		const { status, body } = await get(signed(`/v1/pools/${REVISION}`));

		expect(status).toBe(expected);
		expect(body).toEqual({ error: code });
	});

	it('answers anything unexpected as an unavailable service, logging only its name', async () => {
		describeProtocolPool.mockRejectedValue(new TypeError('boom'));

		const { status, body } = await get(signed(`/v1/pools/${REVISION}`));

		expect(status).toBe(503);
		expect(body).toEqual({ error: 'service_unavailable' });
	});
});
