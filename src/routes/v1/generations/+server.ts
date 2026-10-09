import { json } from '@sveltejs/kit';
import { authorizeGeneration } from '#lib/server/generation/keys.js';
import {
	createGeneration,
	GenerationError,
	parseGenerationRequest
} from '#lib/server/generation/service.js';
import type { RequestHandler } from './$types';

const MAX_BODY_BYTES = 16_384;
const HEADERS = { 'Cache-Control': 'no-store' };

async function readBody(request: Request): Promise<string | null> {
	const reader = request.body?.getReader();
	if (!reader) return '';
	const decoder = new TextDecoder();
	let size = 0;
	let text = '';
	while (true) {
		const { value, done } = await reader.read();
		if (done) return text + decoder.decode();
		size += value.byteLength;
		if (size > MAX_BODY_BYTES) {
			await reader.cancel();
			return null;
		}
		text += decoder.decode(value, { stream: true });
	}
}

function failure(status: number, code: string, message: string): Response {
	return json({ error: { code, message } }, { status, headers: HEADERS });
}

async function checkAccess(request: Request): Promise<Response | null> {
	let access: Awaited<ReturnType<typeof authorizeGeneration>>;
	try {
		access = await authorizeGeneration(request.headers);
	} catch (cause) {
		console.error(
			JSON.stringify({
				event: 'generation_auth_failed',
				name: cause instanceof Error ? cause.name : 'unknown'
			})
		);
		return failure(503, 'service_unavailable', 'Service unavailable');
	}
	if (access === 'unauthorized') return failure(401, 'unauthorized', 'A valid API key is required');
	if (access === 'forbidden')
		return failure(403, 'forbidden', 'This key cannot create generations');
	return null;
}

function generationFailure(cause: unknown): Response {
	if (cause instanceof GenerationError) {
		const status =
			cause.code === 'insufficient_material' || cause.code === 'corpus_unavailable' ? 422 : 400;
		return failure(status, cause.code, cause.message);
	}
	if (cause instanceof SyntaxError) return failure(400, 'invalid_request', 'Invalid JSON');
	console.error(
		JSON.stringify({
			event: 'generation_failed',
			name: cause instanceof Error ? cause.name : 'unknown'
		})
	);
	return failure(503, 'service_unavailable', 'Service unavailable');
}

export const POST: RequestHandler = async ({ request }) => {
	const accessFailure = await checkAccess(request);
	if (accessFailure) return accessFailure;
	if (
		request.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json'
	)
		return failure(400, 'invalid_request', 'Content-Type must be application/json');

	try {
		const body = await readBody(request);
		if (body === null) return failure(400, 'invalid_request', 'Request body is too large');
		const parsed = parseGenerationRequest(JSON.parse(body));
		const result = await createGeneration(parsed);
		console.log(
			JSON.stringify({
				event: 'generation_served',
				selection: result.selection,
				items: result.totalItems,
				complete: result.complete
			})
		);
		return json(result, { headers: HEADERS });
	} catch (cause) {
		return generationFailure(cause);
	}
};
