import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The injection layer, which is all this module is.
 *
 * `@genlexis/core` takes a `GenerationRepository` as an argument on every call;
 * this module is the one place that supplies it. The engine has its own tests,
 * and the repository has its own — what is left, and what is tested here, is
 * that each wrapper reaches the right engine function and hands it the right
 * repository.
 *
 * That sounds trivial until it is wrong. A wrapper pointed at the neighbouring
 * engine function type-checks perfectly and returns plausible sentences.
 */

const repository = { marker: 'the-injected-repository' };

vi.mock('./repository', () => ({ repository }));

const engine = {
	generateAcceptedSentences: vi.fn(async () => 'plain'),
	generateBalancedAcceptedSentences: vi.fn(async () => 'balanced'),
	getAcceptedSentenceCount: vi.fn(async () => 7),
	getValidationCandidate: vi.fn(async () => 'candidate'),
	recordValidation: vi.fn(async () => undefined),
	recordHumanClassification: vi.fn(async () => undefined),
	parseSupportedPattern: vi.fn(),
	SUPPORTED_PATTERNS: ['noun']
};

vi.mock('@genlexis/core', () => engine);

const genlexis = await import('./index');

beforeEach(() => {
	vi.clearAllMocks();
});

describe('the generation wrappers', () => {
	it('passes the options through and appends the repository', async () => {
		const options = { pattern: 'noun', listCount: 1, itemsPerList: 10 } as never;
		await genlexis.generateAcceptedSentences(options);

		expect(engine.generateAcceptedSentences).toHaveBeenCalledWith(options, repository);
	});

	it('keeps the balanced call on its own engine function', async () => {
		// The two differ only in name and in taking a language, so a wrapper wired
		// to the wrong one still type-checks and still returns sentences.
		const options = { language: 'fr-FR', pattern: 'noun' } as never;
		await genlexis.generateBalancedAcceptedSentences(options);

		expect(engine.generateBalancedAcceptedSentences).toHaveBeenCalledWith(options, repository);
		expect(engine.generateAcceptedSentences).not.toHaveBeenCalled();
	});

	it('returns whatever the engine returned, unwrapped', async () => {
		await expect(genlexis.generateAcceptedSentences({} as never)).resolves.toBe('plain');
		await expect(genlexis.generateBalancedAcceptedSentences({} as never)).resolves.toBe('balanced');
	});

	it('asks the engine for the accepted count with only the repository', async () => {
		await expect(genlexis.getAcceptedSentenceCount()).resolves.toBe(7);
		expect(engine.getAcceptedSentenceCount).toHaveBeenCalledWith(repository);
	});
});

describe('the validation wrappers', () => {
	it('passes an explicit pattern filter through', async () => {
		await genlexis.getValidationCandidate('np_verb' as never);
		expect(engine.getValidationCandidate).toHaveBeenCalledWith('np_verb', repository);
	});

	it('passes undefined when no filter was given, rather than a sentinel', async () => {
		await genlexis.getValidationCandidate();
		expect(engine.getValidationCandidate).toHaveBeenCalledWith(undefined, repository);
	});

	it('records a vote with its verdict in the right position', async () => {
		await genlexis.recordValidation(12, false);
		expect(engine.recordValidation).toHaveBeenCalledWith(12, false, repository);
	});

	it('records a human classification with its whole verdict object', async () => {
		const input = { appropriate: true, grammatical: true, semantics: 'natural' } as never;
		await genlexis.recordHumanClassification(12, input);
		expect(engine.recordHumanClassification).toHaveBeenCalledWith(12, input, repository);
	});
});

describe('the re-exports', () => {
	it('forwards the engine helpers the routes rely on', () => {
		// These are pure and come straight from the engine; re-exporting them here
		// is what lets a route import one thing instead of two.
		expect(genlexis.parseSupportedPattern).toBe(engine.parseSupportedPattern);
		expect(genlexis.SUPPORTED_PATTERNS).toBe(engine.SUPPORTED_PATTERNS);
	});
});
