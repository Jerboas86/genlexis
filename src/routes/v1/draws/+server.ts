/**
 * `POST /v1/draws`.
 *
 * Transport only: it authenticates, reads a closed body, hands the request to
 * `createDraw` and maps the closed errors onto statuses. Every rule that decides
 * what a draw *is* lives in `draws.ts`, where it is tested without a connection.
 *
 * Two things this layer owes that the orchestration cannot:
 *
 * - The body is read **once, as text**, because the signature covers the exact
 *   bytes that arrived. Parsing first and re-serialising would verify a
 *   normalised form against a signature taken over the original.
 * - Nothing it logs carries the idempotency key or the exclusion list. The key
 *   identifies an operation and the exclusions name what a person recently
 *   heard; a log line holding either turns an access log into a record nobody
 *   consented to.
 */

import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { verifyRequest } from '$lib/server/material/auth';
import { createDraw, DrawError, type DrawErrorCode } from '$lib/server/material/draws';
import { createDrawRepository } from '$lib/server/material/drawsRepository';
import { repository as generationRepository } from '$lib/server/genlexis/repository';
import type { RequestHandler } from './$types';

/** Bodies are small by construction; anything larger is not this contract. */
const MAX_BODY_BYTES = 64_000;
const DRAW_ID = /^[0-9a-f]{32}$/;
const IDEMPOTENCY_KEY = /^[0-9a-f]{64}$/;
const PROTOCOL_REVISION = /^[a-z0-9][a-z0-9._-]{0,62}[a-z0-9]$/;
const MAX_EXCLUSIONS = 64;

const NO_STORE = { 'Cache-Control': 'no-store' };

/** The closed errors, on the wire. */
const STATUS: Record<DrawErrorCode, number> = {
	unsupported_contract_version: 400,
	invalid_request: 400,
	idempotency_conflict: 409,
	unknown_protocol_revision: 422,
	pool_exhausted: 422,
	balance_tolerance_exceeded: 422,
	incomplete_draw: 422,
	corpus_unavailable: 422,
	service_unavailable: 503
};

/**
 * One structured line per outcome, and nothing that identifies a caller.
 *
 * These lines are the service's metrics until it has better ones: a rising
 * count of `pool_exhausted` or `balance_tolerance_exceeded` is the corpus
 * ceasing to suffice, and `unauthorized` in a burst is a rotation gone wrong on
 * one side. The idempotency key and the exclusions never appear here — they are
 * a linguistic reference to what a person recently heard, and exactly what must
 * not reach an access log.
 */
const record = (line: Record<string, unknown>) => console.log(JSON.stringify(line));

const fail = (code: DrawErrorCode, protocolRevision?: string) => {
	record({ event: 'draw_refused', code, protocolRevision });
	return json({ error: code }, { status: STATUS[code], headers: NO_STORE });
};

interface ParsedRequest {
	contractVersion: string;
	protocolRevision: string;
	idempotencyKey: string;
	excludedDrawIds: string[];
}

/**
 * Reads the body, refusing anything the contract does not name.
 *
 * Closed on purpose: a field the schema does not know is an error, not a value
 * to ignore, because an ignored field can change what a request means without
 * either side noticing.
 */
function parseBody(value: unknown): ParsedRequest | null {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
	const { contractVersion, protocolRevision, idempotencyKey, excludedDrawIds, ...rest } =
		value as Record<string, unknown>;
	if (Object.keys(rest).length > 0) return null;

	if (typeof contractVersion !== 'string') return null;
	if (typeof protocolRevision !== 'string' || !PROTOCOL_REVISION.test(protocolRevision))
		return null;
	if (typeof idempotencyKey !== 'string' || !IDEMPOTENCY_KEY.test(idempotencyKey)) return null;
	if (!Array.isArray(excludedDrawIds) || excludedDrawIds.length > MAX_EXCLUSIONS) return null;
	if (!excludedDrawIds.every((id) => typeof id === 'string' && DRAW_ID.test(id))) return null;

	return {
		contractVersion,
		protocolRevision,
		idempotencyKey,
		excludedDrawIds: excludedDrawIds as string[]
	};
}

export const POST: RequestHandler = async ({ request, url }) => {
	// Read once, as text: the signature covers the bytes that arrived.
	const body = await request.text();
	if (body.length > MAX_BODY_BYTES) return fail('invalid_request');

	const auth = await verifyRequest(
		{
			token: env.PRIVATE_MATERIAL_API_TOKEN ?? '',
			previousToken: env.PRIVATE_MATERIAL_API_TOKEN_PREVIOUS,
			signingSecret: env.PRIVATE_MATERIAL_SIGNING_SECRET ?? '',
			previousSigningSecret: env.PRIVATE_MATERIAL_SIGNING_SECRET_PREVIOUS
		},
		{ method: 'POST', path: url.pathname, headers: request.headers },
		body,
		Math.floor(Date.now() / 1000)
	);
	// Every failure is the same answer: telling an unauthenticated caller which
	// check failed is telling them how to get closer.
	if (!auth.ok) {
		record({ event: 'draw_unauthorized' });
		return json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE });
	}

	let parsed: ParsedRequest | null;
	try {
		parsed = parseBody(JSON.parse(body));
	} catch {
		return fail('invalid_request');
	}
	if (parsed === null) return fail('invalid_request');

	return serve(parsed);
};

/**
 * Draws, and turns every way that can go wrong into the closed answer.
 *
 * Kept apart from the handler so that the request's gates — size, signature,
 * shape — read as a list, and the mapping of failures to codes as another.
 */
async function serve(parsed: ParsedRequest): Promise<Response> {
	try {
		const draw = await createDraw(parsed, {
			repository: createDrawRepository(),
			generationRepository
		});
		record({
			event: 'draw_served',
			protocolRevision: draw.protocolRevision,
			poolRevision: draw.materialRelease.poolRevision,
			items: draw.items.length,
			phonemeBalanceDistance: draw.generation.phonemeBalanceDistance,
			excluded: parsed.excludedDrawIds.length
		});
		return json(draw, { headers: NO_STORE });
	} catch (cause) {
		return refuse(cause, parsed.protocolRevision);
	}
}

/** The closed code for a failure, logged with its name and message only. */
function refuse(cause: unknown, protocolRevision: string): Response {
	if (cause instanceof DrawError) return fail(cause.code, protocolRevision);
	// The engine reports a missing distribution by message; it is a request
	// this service cannot satisfy rather than a fault in it.
	if (cause instanceof Error && cause.message.startsWith('No phoneme distribution'))
		return fail('corpus_unavailable', protocolRevision);
	console.error(
		JSON.stringify({
			event: 'draw_failed',
			protocolRevision,
			name: cause instanceof Error ? cause.name : undefined,
			message: cause instanceof Error ? cause.message : 'unknown'
		})
	);
	return fail('service_unavailable', protocolRevision);
}
