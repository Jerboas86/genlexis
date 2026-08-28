import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONTRACT_VERSION, type DrawErrorCode } from './draws';
import { canonicalRequest, verifyRequest } from './auth';
import { PUBLISHED_REVISIONS, resolveProtocolRevision } from './registry';

/**
 * The producer half of the contract tests.
 *
 * Helixum runs the *same* fixtures against its client. Neither repository
 * imports the other's types, so this is what keeps the two implementations
 * describing one protocol rather than two that merely resemble each other.
 */
const CONTRACT_DIR = resolve(
	dirname(fileURLToPath(import.meta.url)),
	'../../../../contracts/genlexis/v1'
);

interface Fixture {
	name: string;
	contractVersion: string;
	why: string;
	request: { method: string; path: string; body: Record<string, unknown> };
	response: { status: number; body: Record<string, unknown> };
}

/**
 * The request/response fixtures.
 *
 * `signature-vector.json` is deliberately excluded: it pins the canonical
 * request rather than a call, so it has no request body to check against the
 * draw schema. It has its own suite at the bottom of this file.
 */
function fixtures(): Fixture[] {
	return readdirSync(join(CONTRACT_DIR, 'fixtures'))
		.filter((name) => name.endsWith('.json') && name !== 'signature-vector.json')
		.sort()
		.map((name) => JSON.parse(readFileSync(join(CONTRACT_DIR, 'fixtures', name), 'utf8')));
}

const openapi = readFileSync(join(CONTRACT_DIR, 'openapi.yaml'), 'utf8');
const limits = JSON.parse(readFileSync(join(CONTRACT_DIR, 'limits.json'), 'utf8'));

describe('the published contract', () => {
	it('is the version this service implements', () => {
		expect(limits.contractVersion).toBe(CONTRACT_VERSION);
	});

	it('records a hash covering every fixture, so neither side can drift silently', () => {
		const recorded = JSON.parse(readFileSync(join(CONTRACT_DIR, 'CONTRACT_HASH.json'), 'utf8'));
		const names = readdirSync(join(CONTRACT_DIR, 'fixtures')).filter((n) => n.endsWith('.json'));
		for (const name of names) {
			expect(recorded.files.map((file: { file: string }) => file.file)).toContain(
				join('fixtures', name)
			);
		}
	});

	it('describes only the draw endpoint — audio belongs to Voxa', () => {
		expect(openapi).toContain('/v1/draws');
		expect(openapi).not.toContain('/v1/assets/');
		expect(openapi).not.toContain('SynthesisProvenance');
	});
});

describe('the error vocabulary', () => {
	/** Every code the document names, read out of its enum block. */
	const published = openapi
		.slice(openapi.indexOf('    ErrorCode:'), openapi.indexOf('    Error:'))
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.startsWith('- '))
		.map((line) => line.slice(2));

	it('publishes the codes the service can answer with', () => {
		// `unauthorized` and `quota_exceeded` are transport concerns and never
		// leave `createDraw`, so they are published without being in its union.
		const raised: DrawErrorCode[] = [
			'unsupported_contract_version',
			'invalid_request',
			'idempotency_conflict',
			'unknown_protocol_revision',
			'pool_exhausted',
			'balance_tolerance_exceeded',
			'incomplete_draw',
			'corpus_unavailable',
			'service_unavailable'
		];
		for (const code of raised) expect(published).toContain(code);
	});

	it('names every error the fixtures expect', () => {
		for (const fixture of fixtures()) {
			const error = fixture.response.body.error;
			if (typeof error === 'string') expect(published).toContain(error);
		}
	});

	it('no longer publishes the audio errors', () => {
		expect(published).not.toContain('asset_integrity_error');
		expect(published).not.toContain('asset_not_found');
	});
});

describe('the canonical fixtures', () => {
	const all = fixtures();

	it('are all at this contract version', () => {
		expect(all.length).toBeGreaterThan(10);
		for (const fixture of all) expect(fixture.contractVersion).toBe(CONTRACT_VERSION);
	});

	it('each say why they exist, so a later reader can tell intent from accident', () => {
		for (const fixture of all) expect(fixture.why.length).toBeGreaterThan(20);
	});

	it('address the draw endpoint with the request shape this service reads', () => {
		const required = ['contractVersion', 'excludedDrawIds', 'idempotencyKey', 'protocolRevision'];
		for (const fixture of all) {
			expect(fixture.request.path).toBe('/v1/draws');
			expect(fixture.request.method).toBe('POST');
			for (const field of required) expect(fixture.request.body).toHaveProperty(field);
		}
	});

	it('carry an extra field only in the fixture whose whole point is one', () => {
		// The contract is closed, so a stray field in any other fixture would be
		// asserting a request the service must refuse.
		const required = ['contractVersion', 'excludedDrawIds', 'idempotencyKey', 'protocolRevision'];
		const withExtras = all.filter((fixture) =>
			Object.keys(fixture.request.body).some((key) => !required.includes(key))
		);
		expect(withExtras.map((fixture) => fixture.name)).toEqual(['error-unknown-field']);
		expect(withExtras[0]!.response.body.error).toBe('invalid_request');
	});

	it('stay inside the published limits', () => {
		for (const fixture of all) {
			const excluded = fixture.request.body.excludedDrawIds as string[];
			expect(excluded.length).toBeLessThanOrEqual(limits.maxExcludedDrawIds);
			const items = (fixture.response.body.items ?? []) as unknown[];
			expect(items.length).toBeLessThanOrEqual(limits.maxItemsPerDraw);
		}
	});

	it('carry no audio, since the draw is linguistic material', () => {
		for (const fixture of all) {
			const items = (fixture.response.body.items ?? []) as Record<string, unknown>[];
			for (const item of items) {
				expect(item).not.toHaveProperty('audio');
				expect(Object.keys(item).sort()).toEqual(['homonyms', 'itemId', 'itemRevision', 'text']);
			}
			expect(fixture.response.body).not.toHaveProperty('masker');
			expect(fixture.response.body).not.toHaveProperty('gainRule');
		}
	});

	it('report the pool revision beside the seed on every success', () => {
		for (const fixture of all.filter((f) => f.response.status === 200)) {
			const release = fixture.response.body.materialRelease as Record<string, unknown>;
			// A seed alone does not replay a draw: the same seed against a changed
			// pool produces different sentences.
			expect(release.poolRevision).toBeTruthy();
			expect((fixture.response.body.generation as Record<string, unknown>).seed).toBeTruthy();
		}
	});
});

describe('the registry against the contract', () => {
	it('publishes a revision matching the pattern the document accepts', () => {
		const pattern = /^[a-z0-9][a-z0-9._-]{0,62}[a-z0-9]$/;
		for (const revision of PUBLISHED_REVISIONS) expect(revision).toMatch(pattern);
	});

	it('fixes an item count inside the published maximum', () => {
		for (const revision of PUBLISHED_REVISIONS) {
			const configuration = resolveProtocolRevision(revision)!;
			expect(configuration.itemsPerList).toBeGreaterThan(0);
			expect(configuration.itemsPerList).toBeLessThanOrEqual(limits.maxItemsPerDraw);
		}
	});
});

describe('the signing vector', () => {
	/**
	 * The one part of the contract no response fixture can check.
	 *
	 * The canonical request is built independently on each side from the same
	 * document. If one of them changed the separator or added a field, every
	 * fixture would still pass on both and every real call would fail with a
	 * `401`. This turns that into arithmetic — and it goes through `verifyRequest`
	 * rather than re-deriving the signature, so it exercises the path a real
	 * caller takes.
	 */
	const vector = JSON.parse(
		readFileSync(join(CONTRACT_DIR, 'fixtures', 'signature-vector.json'), 'utf8')
	) as {
		signingSecret: string;
		request: { method: string; path: string; timestamp: number; body: string };
		canonicalRequest: string;
		signature: string;
	};

	const headersFor = (signature: string) =>
		new Headers({
			Authorization: 'Bearer the-token',
			'X-Genlexis-Timestamp': String(vector.request.timestamp),
			'X-Genlexis-Signature': signature
		});

	it('builds the canonical request the document specifies', () => {
		const { method, path, timestamp, body } = vector.request;
		expect(canonicalRequest(method, path, timestamp, body)).toBe(vector.canonicalRequest);
	});

	it('accepts the signature a conforming client produces', async () => {
		const result = await verifyRequest(
			{ token: 'the-token', signingSecret: vector.signingSecret },
			{
				method: vector.request.method,
				path: vector.request.path,
				headers: headersFor(vector.signature)
			},
			vector.request.body,
			vector.request.timestamp
		);
		expect(result).toEqual({ ok: true });
	});

	it('refuses a signature over a body that differs by one character', async () => {
		// Built by substitution rather than by string replacement, so the tamper
		// cannot silently become a no-op if the fixture's contents change.
		const tampered = `${vector.request.body.slice(0, -1)} `;
		expect(tampered).not.toBe(vector.request.body);

		const result = await verifyRequest(
			{ token: 'the-token', signingSecret: vector.signingSecret },
			{
				method: vector.request.method,
				path: vector.request.path,
				headers: headersFor(vector.signature)
			},
			tampered,
			vector.request.timestamp
		);
		expect(result).toEqual({ ok: false, reason: 'bad_signature' });
	});
});
