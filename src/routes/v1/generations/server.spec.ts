import { beforeEach, describe, expect, it, vi } from 'vitest';

const authorizeGeneration = vi.fn();
const createGeneration = vi.fn();
vi.mock('$lib/server/generation/keys', () => ({
	authorizeGeneration: (...args: unknown[]) => authorizeGeneration(...args)
}));
vi.mock('$lib/server/generation/service', async (original) => ({
	...(await original<typeof import('$lib/server/generation/service')>()),
	createGeneration: (...args: unknown[]) => createGeneration(...args)
}));

const url = 'https://genlexis.test/v1/generations';
const body = () =>
	JSON.stringify({
		selection: 'random',
		language: 'fr-FR',
		pattern: 'noun',
		listCount: 1,
		itemsPerList: 1,
		seed: 'stable'
	});
const request = (value = body(), key = 'glx_test') =>
	new Request(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
		body: value
	});

async function post(given: Request) {
	const { POST } = await import('./+server');
	const response = await POST({ request: given } as never);
	return { status: response.status, headers: response.headers, body: await response.json() };
}

describe('POST /v1/generations', () => {
	beforeEach(() => {
		authorizeGeneration.mockReset().mockResolvedValue('allowed');
		createGeneration.mockReset().mockResolvedValue({
			selection: 'random',
			lists: [[{ sentenceId: 1, sentence: 'mot', pattern: 'noun' }]],
			totalItems: 1,
			complete: true
		});
		vi.spyOn(console, 'log').mockImplementation(() => {});
		vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	it.each([
		['unauthorized', 401],
		['forbidden', 403]
	] as const)('rejects %s before parsing', async (access, status) => {
		authorizeGeneration.mockResolvedValue(access);
		const answer = await post(request('{'));
		expect(answer.status).toBe(status);
		expect(createGeneration).not.toHaveBeenCalled();
		expect(answer.headers.get('Cache-Control')).toBe('no-store');
	});

	it('serves a request without exposing the key in logs', async () => {
		const answer = await post(request());
		expect(answer.status).toBe(200);
		expect(answer.headers.get('Cache-Control')).toBe('no-store');
		expect(createGeneration).toHaveBeenCalledWith(expect.objectContaining({ seed: 'stable' }));
		expect(JSON.stringify((console.log as ReturnType<typeof vi.fn>).mock.calls)).not.toContain(
			'glx_test'
		);
	});

	it('rejects malformed JSON', async () => {
		const answer = await post(request('{'));
		expect(answer.status).toBe(400);
		expect(answer.body).toEqual({ error: { code: 'invalid_request', message: 'Invalid JSON' } });
	});

	it('rejects a body over the byte limit before generation', async () => {
		const answer = await post(request('x'.repeat(16_385)));
		expect(answer.status).toBe(400);
		expect(createGeneration).not.toHaveBeenCalled();
	});
});
