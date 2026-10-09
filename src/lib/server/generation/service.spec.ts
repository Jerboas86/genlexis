import { describe, expect, it, vi } from 'vitest';
import { createGeneration, GenerationError, parseGenerationRequest } from './service';

const valid = () => ({
	selection: 'random',
	language: 'fr-FR',
	pattern: 'det_noun',
	listCount: 1,
	itemsPerList: 2,
	seed: 'stable'
});

const item = (sentenceId: number) => ({
	sentenceId,
	sentence: `mot ${sentenceId}`,
	pattern: 'det_noun'
});

describe('generation request', () => {
	it('accepts the two modes and applies explicit defaults', () => {
		expect(parseGenerationRequest(valid()).allowPartial).toBe(false);
		expect(
			parseGenerationRequest(
				{ ...valid(), selection: 'phoneme_balanced', seed: undefined },
				() => 'new-seed'
			).seed
		).toBe('new-seed');
	});

	it.each([
		{ ...valid(), extra: true },
		{ ...valid(), filters: { surprise: 'x' } },
		{ ...valid(), listCount: 6 },
		{ ...valid(), itemsPerList: 0 },
		{ ...valid(), filters: { detType: 'bad' } },
		{ ...valid(), filters: { lengthUnit: 'phonemes' } },
		{ ...valid(), pattern: 'noun', filters: { detType: 'definite' } },
		{ ...valid(), allowPartial: 'true' }
	])('refuses invalid input %#', (value) => {
		expect(() => parseGenerationRequest(value)).toThrowError(GenerationError);
	});

	it('distinguishes an unsupported language', () => {
		expect(() => parseGenerationRequest({ ...valid(), language: 'en-US' })).toThrowError(
			new GenerationError('unsupported_language', 'Only fr-FR is supported')
		);
	});
});

describe('generation result', () => {
	it('refuses a short result unless explicitly allowed', async () => {
		const random = vi.fn().mockResolvedValue({ lists: [[item(1)]], totalItems: 1 });
		const balanced = vi.fn();
		await expect(
			createGeneration(parseGenerationRequest(valid()), { random, balanced })
		).rejects.toMatchObject({ code: 'insufficient_material' });
		const answer = await createGeneration(
			parseGenerationRequest({ ...valid(), allowPartial: true }),
			{ random, balanced }
		);
		expect(answer).toMatchObject({
			requestedItems: 2,
			totalItems: 1,
			complete: false,
			lists: [[item(1)]]
		});
		expect(answer).not.toHaveProperty('scores');
	});

	it('refuses an empty result even when partial results are allowed', async () => {
		await expect(
			createGeneration(parseGenerationRequest({ ...valid(), allowPartial: true }), {
				random: vi.fn().mockResolvedValue({ lists: [], totalItems: 0 }),
				balanced: vi.fn()
			})
		).rejects.toMatchObject({ code: 'insufficient_material' });
	});

	it('returns balanced scores with the selected lists', async () => {
		const balanced = vi.fn().mockResolvedValue({
			lists: [[item(1), item(2)]],
			totalItems: 2,
			scores: [0.2],
			aggregateScore: 0.2,
			poolSize: 8
		});
		const answer = await createGeneration(
			parseGenerationRequest({ ...valid(), selection: 'phoneme_balanced' }),
			{ random: vi.fn(), balanced }
		);
		expect(answer).toMatchObject({
			selection: 'phoneme_balanced',
			complete: true,
			scores: [0.2],
			aggregateScore: 0.2,
			poolSize: 8
		});
		expect(balanced).toHaveBeenCalledWith(
			expect.objectContaining({ language: 'fr-FR', seed: 'stable', pattern: 'det_noun' })
		);
	});
});
