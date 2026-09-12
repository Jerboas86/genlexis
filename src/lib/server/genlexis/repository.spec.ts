import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The Drizzle client, replaced by a recorder.
 *
 * `$lib/server/db` opens a Neon connection at import time and throws without
 * `PRIVATE_DATABASE_URL`, so it has to be mocked for the module to load at all.
 * That is not a workaround here: the point of these tests is what the repository
 * *asks* the database, and a real connection would answer instead of recording.
 */
const executed: { sql: string; params: unknown[] }[] = [];
const inserted: { table: unknown; values: unknown }[] = [];
let nextRows: Record<string, unknown>[] = [];

const fakeDb = {
	execute: vi.fn(async (statement: { queryChunks?: unknown[] }) => {
		executed.push(renderSql(statement));
		return { rows: nextRows };
	}),
	insert: vi.fn((table: unknown) => ({
		values: vi.fn(async (values: unknown) => {
			inserted.push({ table, values });
		})
	}))
};

/**
 * Flattens a Drizzle `SQL` object into the text and the bound parameters.
 *
 * Asserting on the rendered text is what makes a renamed view or slot fail here
 * rather than in production: the identifiers are interpolated as raw fragments,
 * so nothing else in the type system is watching them.
 */
function renderSql(statement: unknown): { sql: string; params: unknown[] } {
	const chunks = (statement as { queryChunks?: unknown[] }).queryChunks ?? [];
	let text = '';
	const params: unknown[] = [];
	const walk = (chunk: unknown): void => {
		if (chunk === null || chunk === undefined) return;
		if (Array.isArray(chunk)) {
			chunk.forEach(walk);
			return;
		}
		// A bound value can reach the walker as a bare primitive rather than as a
		// wrapped parameter object.
		if (typeof chunk !== 'object') {
			params.push(chunk);
			return;
		}
		const record = chunk as Record<string, unknown>;
		if (typeof record.value === 'string' && Array.isArray(record.value) === false) {
			text += record.value;
			return;
		}
		if (Array.isArray(record.value)) {
			text += (record.value as unknown[]).join('');
			return;
		}
		if (Array.isArray(record.queryChunks)) {
			(record.queryChunks as unknown[]).forEach(walk);
			return;
		}
		if ('encoder' in record) {
			params.push(record.value);
			return;
		}
	};
	chunks.forEach(walk);
	return { sql: text, params };
}

vi.mock('$lib/server/db', () => ({ db: fakeDb }));

const { repository } = await import('./repository');

beforeEach(() => {
	executed.length = 0;
	inserted.length = 0;
	nextRows = [];
	vi.clearAllMocks();
});

describe('the repository surface', () => {
	it('exposes both halves under one object, as the engine expects', () => {
		// The generation half comes from `@genlexis/core`'s Drizzle adapter and the
		// validation half is local. A missing method here is a runtime failure in
		// a route, which is exactly what the type is meant to prevent.
		for (const method of [
			'countAcceptedSentences',
			'findRandomAcceptedItems',
			'findAcceptedItemsWithIpa',
			'getPhonemeDistribution',
			'findLeastVotedValidationCandidate',
			'recordValidation',
			'recordHumanClassification'
		]) {
			expect(typeof (repository as unknown as Record<string, unknown>)[method]).toBe('function');
		}
	});
});

describe('findLeastVotedValidationCandidate', () => {
	const row = {
		sentenceId: 12,
		sentence: 'le chat dort',
		pattern: 'det_noun',
		voteCount: 3,
		overallAcceptableCount: 2,
		overallUnacceptableCount: 1,
		llmAppropriate: true,
		llmGrammatical: true,
		llmSemantics: 'natural',
		hasLlm: true
	};

	it('returns null when nothing is left to validate', async () => {
		nextRows = [];
		expect(await repository.findLeastVotedValidationCandidate()).toBeNull();
	});

	it('folds the joined LLM columns into a nested verdict', async () => {
		nextRows = [row];
		const candidate = await repository.findLeastVotedValidationCandidate();

		expect(candidate).toEqual({
			sentenceId: 12,
			sentence: 'le chat dort',
			pattern: 'det_noun',
			voteCount: 3,
			overallAcceptableCount: 2,
			overallUnacceptableCount: 1,
			llm: { appropriate: true, grammatical: true, semantics: 'natural' }
		});
	});

	it('leaves the LLM verdict null when the join found no row', async () => {
		// `hasLlm` distinguishes "no LLM has judged this" from "the LLM judged it
		// and said null to everything", which the three columns alone cannot.
		nextRows = [
			{ ...row, hasLlm: false, llmAppropriate: null, llmGrammatical: null, llmSemantics: null }
		];
		const candidate = await repository.findLeastVotedValidationCandidate();
		expect(candidate?.llm).toBeNull();
	});

	it('keeps a present-but-undecided LLM verdict distinct from an absent one', async () => {
		nextRows = [
			{ ...row, hasLlm: true, llmAppropriate: null, llmGrammatical: null, llmSemantics: null }
		];
		const candidate = await repository.findLeastVotedValidationCandidate();
		expect(candidate?.llm).toEqual({ appropriate: null, grammatical: null, semantics: null });
	});

	it('never offers the bare-noun pattern for validation', async () => {
		nextRows = [row];
		await repository.findLeastVotedValidationCandidate();
		expect(executed[0].sql).toContain("h.pattern <> 'noun'");
	});

	it('requires an LLM pass before offering the two richer patterns', async () => {
		nextRows = [row];
		await repository.findLeastVotedValidationCandidate();
		expect(executed[0].sql).toContain("h.pattern NOT IN ('det_noun_adj', 'np_verb')");
		expect(executed[0].sql).toContain('l.sentence_id IS NOT NULL');
	});

	it('orders by fewest votes so attention goes where it is scarcest', async () => {
		nextRows = [row];
		await repository.findLeastVotedValidationCandidate();
		expect(executed[0].sql).toContain('ORDER BY h.vote_count ASC');
		// `random()` breaks ties, so two judges are not handed the same sentence.
		expect(executed[0].sql).toContain('random()');
		expect(executed[0].sql).toContain('LIMIT 1');
	});

	it('reads from the two published views, by name', async () => {
		// These names are raw SQL fragments; nothing in the type system watches
		// them, so a rename would otherwise only fail in production.
		nextRows = [row];
		await repository.findLeastVotedValidationCandidate();
		expect(executed[0].sql).toContain('genlexis.human_classification_summaries');
		expect(executed[0].sql).toContain('genlexis.latest_llm_classifications');
	});

	it('binds a pattern filter as a parameter rather than interpolating it', async () => {
		nextRows = [row];
		await repository.findLeastVotedValidationCandidate('np_verb');
		expect(executed[0].sql).toContain('AND h.pattern =');
		expect(executed[0].params).toContain('np_verb');
	});

	it('adds no pattern clause when none was asked for', async () => {
		nextRows = [row];
		await repository.findLeastVotedValidationCandidate();
		expect(executed[0].sql).not.toContain('AND h.pattern =');
		expect(executed[0].params).toEqual([]);
	});

	it('reads an array result as well as a rows envelope', async () => {
		// Neon's driver has returned both shapes across versions, and the
		// repository accepts either. A regression here is a silent empty result.
		fakeDb.execute.mockResolvedValueOnce([row] as never);
		expect(await repository.findLeastVotedValidationCandidate()).not.toBeNull();
	});
});

describe('recordValidation', () => {
	it('writes a human vote carrying only the overall verdict', async () => {
		await repository.recordValidation(7, true);
		expect(inserted).toHaveLength(1);
		expect(inserted[0].values).toEqual({
			sentenceId: 7,
			judgeType: 'human',
			overallAcceptable: true
		});
	});

	it('records a negative vote as a value, not as an absence', async () => {
		await repository.recordValidation(7, false);
		expect(inserted[0].values).toMatchObject({ overallAcceptable: false });
	});

	it('never marks a human vote as anything but human', async () => {
		await repository.recordValidation(7, true);
		expect(inserted[0].values).toMatchObject({ judgeType: 'human' });
	});
});

describe('recordHumanClassification', () => {
	it('writes the full verdict chain as given', async () => {
		await repository.recordHumanClassification(9, {
			appropriate: true,
			grammatical: true,
			semantics: 'plausible'
		});
		expect(inserted[0].values).toEqual({
			sentenceId: 9,
			judgeType: 'human',
			appropriate: true,
			grammatical: true,
			semantics: 'plausible'
		});
	});

	it('passes the closed questions through as null rather than dropping them', async () => {
		// A column left out of the insert takes its database default; `null` is
		// the value that says the question was never put.
		await repository.recordHumanClassification(9, {
			appropriate: false,
			grammatical: null,
			semantics: null
		});
		expect(inserted[0].values).toEqual({
			sentenceId: 9,
			judgeType: 'human',
			appropriate: false,
			grammatical: null,
			semantics: null
		});
	});

	it('does not set the overall verdict, which is the other vote path', async () => {
		await repository.recordHumanClassification(9, {
			appropriate: true,
			grammatical: false,
			semantics: null
		});
		expect(inserted[0].values).not.toHaveProperty('overallAcceptable');
	});
});
