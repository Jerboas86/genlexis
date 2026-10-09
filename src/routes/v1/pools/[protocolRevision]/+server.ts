/**
 * `GET /v1/pools/{protocolRevision}`.
 *
 * Transport only, like `POST /v1/draws`: it authenticates, checks the revision's
 * shape, hands it to `describeProtocolPool` and maps the closed errors onto
 * statuses. What a pool *is* lives in `pools.ts`.
 *
 * The request has no body, so the signature covers the method, the path and
 * the timestamp over an empty body — the same canonical request as a draw's,
 * with nothing in its last field.
 */

import { json } from '@sveltejs/kit';
import * as env from '$app/env/private';
import { verifyRequest } from '#lib/server/material/auth.js';
import { describeProtocolPool, PoolError, type PoolErrorCode } from '#lib/server/material/pools.js';
import { repository } from '#lib/server/genlexis/repository.js';
import type { RequestHandler } from './$types';

const PROTOCOL_REVISION = /^[a-z0-9][a-z0-9._-]{0,62}[a-z0-9]$/;

const NO_STORE = { 'Cache-Control': 'no-store' };

/** The closed errors, on the wire. */
const STATUS: Record<PoolErrorCode | 'invalid_request', number> = {
	invalid_request: 400,
	unknown_protocol_revision: 422,
	corpus_unavailable: 422,
	service_unavailable: 503
};

/** One structured line per outcome. A pool names no person, so there is nothing to withhold. */
const record = (line: Record<string, unknown>) => console.log(JSON.stringify(line));

const fail = (code: PoolErrorCode | 'invalid_request', protocolRevision?: string) => {
	record({ event: 'pool_refused', code, protocolRevision });
	return json({ error: code }, { status: STATUS[code], headers: NO_STORE });
};

export const GET: RequestHandler = async ({ request, url, params }) => {
	const auth = await verifyRequest(
		{
			token: env.PRIVATE_MATERIAL_API_TOKEN ?? '',
			previousToken: env.PRIVATE_MATERIAL_API_TOKEN_PREVIOUS,
			signingSecret: env.PRIVATE_MATERIAL_SIGNING_SECRET ?? '',
			previousSigningSecret: env.PRIVATE_MATERIAL_SIGNING_SECRET_PREVIOUS
		},
		{ method: 'GET', path: url.pathname, headers: request.headers },
		'',
		Math.floor(Date.now() / 1000)
	);
	if (!auth.ok) {
		record({ event: 'pool_unauthorized' });
		return json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE });
	}

	const { protocolRevision } = params;
	if (!PROTOCOL_REVISION.test(protocolRevision)) return fail('invalid_request');

	try {
		const pool = await describeProtocolPool(protocolRevision, { repository });
		record({
			event: 'pool_served',
			protocolRevision,
			poolRevision: pool.materialRelease.poolRevision,
			items: pool.items.length,
			poolDigest: pool.poolDigest
		});
		return json(pool, { headers: NO_STORE });
	} catch (cause) {
		if (cause instanceof PoolError) return fail(cause.code, protocolRevision);
		console.error(
			JSON.stringify({
				event: 'pool_failed',
				protocolRevision,
				name: cause instanceof Error ? cause.name : undefined,
				message: cause instanceof Error ? cause.message : 'unknown'
			})
		);
		return fail('service_unavailable', protocolRevision);
	}
};
