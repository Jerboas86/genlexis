import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { frenchLanguagePreset } from '../presets/fr-FR.js';
import { DEFAULT_PATTERNS } from '../types.js';
import { createDrizzleGenerationRepository, groupPoolRows, lexicalOf } from './drizzle.js';

/**
 * The adapter against a recording double of the database.
 *
 * What PostgreSQL returns is the smoke tests' to prove. What this file owes is
 * that the three queries apply the filters they claim, that a draw and a pool
 * read the same drawable set, and that pool rows become entries faithfully.
 */

const dialect = new PgDialect();

/** A database that records every statement, rendered, and answers with `rows`. */
function recording(rows: Record<string, unknown>[] = []) {
	const statements: { sql: string; params: unknown[] }[] = [];
	const db = {
		execute: async <T extends Record<string, unknown>>(statement: SQL) => {
			statements.push(dialect.sqlToQuery(statement));
			return { rows: rows as T[] };
		}
	};
	const repository = createDrizzleGenerationRepository(db, {
		schema: {
			acceptanceView: 'g.sentence_acceptance',
			tokensTable: 'g.tokens',
			lexicalEntriesTable: 'g.lexical_entries',
			phonemeDistributionTable: 'g.distributions',
			classificationsTable: 'g.classifications',
			humanSummariesView: 'g.human',
			latestLlmView: 'g.llm'
		},
		slots: { det: 'det', noun: 'noun', adj: 'adj', verb: 'verb' },
		patterns: DEFAULT_PATTERNS,
		preset: frenchLanguagePreset
	});
	return { repository, statements };
}

/**
 * The part of a statement from `FROM` to the end of its `WHERE`, white space
 * and placeholder numbers normalised: the drawable set a query reads.
 */
const drawableSet = (statement: string) => {
	const flat = statement.replace(/\s+/g, ' ').replace(/\$\d+/g, '$');
	const start = flat.indexOf('FROM g.sentence_acceptance');
	const ends = [flat.indexOf(' ORDER BY', start), flat.indexOf(' ) SELECT', start)].filter(
		(index) => index > start
	);
	return flat.slice(start, Math.min(...ends));
};

const FILTERS = {
	language: 'fr-FR',
	pattern: 'np_verb' as const,
	lexicalDensity: 'medium' as const,
	gender: 'f' as const,
	grammNumber: 's' as const,
	detType: 'definite' as const,
	length: 2,
	lengthUnit: 'syllables' as const
};

/** One token row as the pool query returns it. */
const tokenRow = (sentenceId: number, position: number, extra: Record<string, unknown> = {}) => ({
	sentenceId,
	sentence: `Phrase ${sentenceId}`,
	pattern: 'np_verb',
	dedupeKey: `pair-${sentenceId}`,
	nounPhonoIpa: 'ʃa',
	verbPhonoIpa: 'dɔʁ',
	position,
	slot: position === 1 ? 'det' : position === 2 ? 'noun' : 'verb',
	surface: `w${position}`,
	hasLexical: false,
	source: null,
	...extra
});

describe('the drawable set', () => {
	it('is the same for a draw and a pool', async () => {
		const { repository, statements } = recording();

		await repository.findAcceptedItemsWithIpa({ ...FILTERS, poolSize: 10, seed: 's' });
		await repository.findPoolEntries(FILTERS);

		const [draw, pool] = statements;
		expect(drawableSet(pool!.sql)).toContain('noun_le.phono_ipa IS NOT NULL');
		expect(drawableSet(pool!.sql)).toBe(drawableSet(draw!.sql));
	});

	it('applies every filter the options name', async () => {
		const { repository, statements } = recording();

		await repository.findPoolEntries(FILTERS);

		const { sql, params } = statements[0]!;
		expect(sql).toContain('noun_le.phono_ipa IS NOT NULL');
		expect(sql).toContain('noun_le.gender =');
		expect(sql).toContain('noun_le.number =');
		expect(sql).toContain('noun_le.syllable_count =');
		expect(sql).toContain('noun_le.pld20 >=');
		expect(sql).toContain('LOWER(det_token.surface) IN');
		expect(sql).toContain('LEFT JOIN g.lexical_entries verb_le');
		expect(params).toEqual(expect.arrayContaining(['fr-FR', 'np_verb', 'f', 's', 2, 'le', 'la']));
	});

	it('keeps every variant in a pool, and one per pair in a draw', async () => {
		const { repository, statements } = recording();

		await repository.findAcceptedItemsWithIpa({ ...FILTERS, poolSize: 10 });
		await repository.findPoolEntries(FILTERS);

		expect(statements[0]!.sql).toContain('DISTINCT ON');
		expect(statements[1]!.sql).not.toContain('DISTINCT ON');
		expect(statements[1]!.sql).toContain("noun_token.surface || ' ' || verb_token.surface");
	});

	it('keys an adjective pattern on the noun and its adjective', async () => {
		const { repository, statements } = recording();

		await repository.findPoolEntries({ language: 'fr-FR', pattern: 'det_noun_adj' });

		expect(statements[0]!.sql).toContain("noun_token.surface || ' ' || adj_token.surface");
		expect(statements[0]!.sql).toContain('adj_le.phono_ipa AS "adjPhonoIpa"');
	});

	it('keeps the unbalanced selection as it was: no language, an optional noun entry', async () => {
		const { repository, statements } = recording();

		await repository.findRandomAcceptedItems({
			pattern: 'np_verb',
			limit: 5,
			lexicalDensity: 'high'
		});

		const { sql } = statements[0]!;
		expect(sql).toContain('LEFT JOIN g.lexical_entries noun_le');
		expect(sql).not.toContain('s.language =');
		expect(sql).not.toContain('verb_token');
		expect(sql).toContain('noun_le.pld20 <');
	});

	it('restricts an API random selection to its requested language', async () => {
		const { repository, statements } = recording();
		await repository.findRandomAcceptedItems({ pattern: 'noun', language: 'fr-FR', limit: 2 });
		expect(statements[0]!.sql).toContain('s.language =');
		expect(statements[0]!.params).toContain('fr-FR');
	});
});

describe('findAcceptedItemsWithIpa', () => {
	it('returns the transcriptions of every word it carries', async () => {
		const { repository } = recording([
			{
				sentenceId: 1,
				sentence: 'a',
				pattern: 'np_verb',
				dedupeKey: 'k',
				phonoIpa: 'ʃa',
				verbPhonoIpa: 'dɔʁ'
			}
		]);

		const [item] = await repository.findAcceptedItemsWithIpa({ ...FILTERS, poolSize: 1 });

		expect(item!.phonoIpas).toEqual(['ʃa', 'dɔʁ']);
	});
});

describe('findPoolEntries', () => {
	it('groups token rows into entries, in sentence and position order', async () => {
		const { repository } = recording([
			tokenRow(1, 1),
			tokenRow(1, 2),
			tokenRow(1, 3),
			tokenRow(2, 1),
			tokenRow(2, 2)
		]);

		const entries = await repository.findPoolEntries(FILTERS);

		expect(entries.map((entry) => entry.sentenceId)).toEqual([1, 2]);
		expect(entries[0]!.tokens.map((token) => token.position)).toEqual([1, 2, 3]);
		expect(entries[0]!.phonoIpas).toEqual(['ʃa', 'dɔʁ']);
		expect(entries[0]!.tokens[0]!.lexical).toBeNull();
	});
});

describe('lexicalOf', () => {
	it('reads numbers as numbers and empty text as no value', () => {
		const lexical = lexicalOf(
			tokenRow(1, 2, {
				hasLexical: true,
				source: 'lexique4',
				lemma: 'chat',
				gender: '',
				frequency: '49.703',
				pld20: 1,
				rtFlp: null
			}) as never
		);

		expect(lexical).toMatchObject({
			source: 'lexique4',
			lemma: 'chat',
			gender: null,
			frequency: 49.703,
			pld20: 1,
			rtFlp: null
		});
	});

	it('is null for a token without an entry', () => {
		expect(lexicalOf(tokenRow(1, 1) as never)).toBeNull();
	});
});

describe('groupPoolRows', () => {
	it('returns nothing for no rows', () => {
		expect(groupPoolRows([])).toEqual([]);
	});
});

describe('findSentenceTokens', () => {
	it('groups the tokens of the sentences asked for, in position order', async () => {
		const { repository, statements } = recording([
			{ sentenceId: 7, position: 1, slot: 'det', surface: 'Le' },
			{ sentenceId: 7, position: 2, slot: 'noun', surface: 'chat' },
			{ sentenceId: 9, position: 1, slot: 'noun', surface: "l'autorité" }
		]);

		const tokens = await repository.findSentenceTokens('fr-FR', [7, 9]);

		expect(tokens.get(7)).toEqual([
			{ position: 1, slot: 'det', surface: 'Le' },
			{ position: 2, slot: 'noun', surface: 'chat' }
		]);
		expect(tokens.get(9)).toHaveLength(1);
		expect(statements[0]!.params).toEqual(['fr-FR', 7, 9]);
	});

	it('asks nothing for no sentences', async () => {
		const { repository, statements } = recording();

		expect((await repository.findSentenceTokens('fr-FR', [])).size).toBe(0);
		expect(statements).toHaveLength(0);
	});
});
