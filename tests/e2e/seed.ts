import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

const LANGUAGE = 'fr-FR';
const MAX_FIXTURE_LENGTH = 20;

const fixtureNamespace = [
	process.env.GITHUB_RUN_ID,
	process.env.GITHUB_RUN_ATTEMPT,
	process.env.GITHUB_JOB,
	process.env.TEST_WORKER_INDEX,
	process.pid
]
	.filter(Boolean)
	.join('-')
	.replace(/[^a-zA-Z0-9-]/g, '-')
	.toLowerCase();

const SOURCE_MARKER = `e2e-genlexis-test-${fixtureNamespace}`;
/**
 * This worker's fixture namespace.
 *
 * Exported because assertions need it too: Playwright runs workers in parallel
 * against one database, so every worker's nouns are visible to every other
 * worker's queries. A test that asserts "exactly these nouns" has to say whose.
 */
export const FIXTURE_SUFFIX = fixtureNamespace.replace(/-/g, '') || 'local';
export const FIXTURE_PHONEME_COUNT =
	(FIXTURE_SUFFIX.split('').reduce((total, char) => total + char.charCodeAt(0), 0) %
		MAX_FIXTURE_LENGTH) +
	1;

type LexicalEntrySpec = {
	ref: string;
	surface: string;
	gender?: 'm' | 'f';
	number?: 's' | 'p';
	category?: string;
	phonemeCount?: number;
	syllableCount?: number;
	pld20?: number;
};

type SentenceSpec = {
	ref: string;
	sentence: string;
	pattern: 'det_noun' | 'noun' | 'det_noun_adj' | 'np_verb';
	tokens: { slot: 'det' | 'noun' | 'adj' | 'verb'; entryRef: string }[];
	/**
	 * A seeded LLM pass.
	 *
	 * `findLeastVotedValidationCandidate` only offers `det_noun_adj` and
	 * `np_verb` once an LLM has judged them, so a fixture of those patterns
	 * without this is invisible to the classification screen.
	 */
	llm?: { appropriate: boolean; grammatical: boolean | null; semantics: string | null };
};

// Made-up noun surfaces avoid clashing with real production lexicon.
export const NOUN_MS = `xetax${FIXTURE_SUFFIX}`;
export const NOUN_MP = `xetaxs${FIXTURE_SUFFIX}`;
export const NOUN_FS = `yutame${FIXTURE_SUFFIX}`;
export const NOUN_FP = `yutames${FIXTURE_SUFFIX}`;
/** The adjective and verb the two richer patterns need. */
export const ADJ_MS = `zoripe${FIXTURE_SUFFIX}`;
export const VERB_S = `qumibe${FIXTURE_SUFFIX}`;

const lexicalEntries: LexicalEntrySpec[] = [
	{ ref: 'det-le', surface: 'le', gender: 'm', number: 's', category: 'det' },
	{ ref: 'det-la', surface: 'la', gender: 'f', number: 's', category: 'det' },
	{ ref: 'det-les', surface: 'les', number: 'p', category: 'det' },
	{ ref: 'det-un', surface: 'un', gender: 'm', number: 's', category: 'det' },
	{ ref: 'det-une', surface: 'une', gender: 'f', number: 's', category: 'det' },
	{ ref: 'adj-ms', surface: ADJ_MS, gender: 'm', number: 's', category: 'adj' },
	{ ref: 'verb-s', surface: VERB_S, number: 's', category: 'verb' },
	{
		ref: 'noun-ms',
		surface: NOUN_MS,
		gender: 'm',
		number: 's',
		category: 'noun',
		phonemeCount: FIXTURE_PHONEME_COUNT,
		syllableCount: 2,
		pld20: 1.5
	},
	{
		ref: 'noun-mp',
		surface: NOUN_MP,
		gender: 'm',
		number: 'p',
		category: 'noun',
		phonemeCount: FIXTURE_PHONEME_COUNT,
		syllableCount: 3,
		pld20: 2.5
	},
	{
		ref: 'noun-fs',
		surface: NOUN_FS,
		gender: 'f',
		number: 's',
		category: 'noun',
		phonemeCount: FIXTURE_PHONEME_COUNT,
		syllableCount: 2,
		pld20: 3.5
	},
	{
		ref: 'noun-fp',
		surface: NOUN_FP,
		gender: 'f',
		number: 'p',
		category: 'noun',
		phonemeCount: FIXTURE_PHONEME_COUNT,
		syllableCount: 4,
		pld20: 1.5
	}
];

// Distinct syllable counts and pld20 bands used by the noun fixtures above.
// Tests combine these with FIXTURE_PHONEME_COUNT to scope to fixture rows only.
export const FIXTURE_SYLLABLE_COUNT_SHARED = 2;
export const FIXTURE_SYLLABLE_COUNT_UNIQUE = 4;

const dn = (det: string, noun: string, detRef: string, nounRef: string): SentenceSpec => ({
	ref: `dn-${detRef}-${nounRef}`,
	sentence: `${det} ${noun}`,
	pattern: 'det_noun',
	tokens: [
		{ slot: 'det', entryRef: detRef },
		{ slot: 'noun', entryRef: nounRef }
	]
});

const n = (noun: string, nounRef: string): SentenceSpec => ({
	ref: `n-${nounRef}`,
	sentence: noun,
	pattern: 'noun',
	tokens: [{ slot: 'noun', entryRef: nounRef }]
});

/** `det + noun + adj`, judged by an LLM so the classification screen offers it. */
const dna = (): SentenceSpec => ({
	ref: 'dna-le-ms',
	sentence: `le ${NOUN_MS} ${ADJ_MS}`,
	pattern: 'det_noun_adj',
	tokens: [
		{ slot: 'det', entryRef: 'det-le' },
		{ slot: 'noun', entryRef: 'noun-ms' },
		{ slot: 'adj', entryRef: 'adj-ms' }
	],
	// Deliberately undecided: the screen pre-fills from the LLM verdict, and a
	// fully decided one would hide the gating this fixture exists to exercise.
	llm: { appropriate: true, grammatical: null, semantics: null }
});

/** `det + noun + verb`, likewise. */
const npv = (): SentenceSpec => ({
	ref: 'npv-le-ms',
	sentence: `le ${NOUN_MS} ${VERB_S}`,
	pattern: 'np_verb',
	tokens: [
		{ slot: 'det', entryRef: 'det-le' },
		{ slot: 'noun', entryRef: 'noun-ms' },
		{ slot: 'verb', entryRef: 'verb-s' }
	],
	llm: { appropriate: true, grammatical: null, semantics: null }
});

const sentences: SentenceSpec[] = [
	dn('le', NOUN_MS, 'det-le', 'noun-ms'),
	dn('un', NOUN_MS, 'det-un', 'noun-ms'),
	dn('les', NOUN_MP, 'det-les', 'noun-mp'),
	dn('la', NOUN_FS, 'det-la', 'noun-fs'),
	dn('une', NOUN_FS, 'det-une', 'noun-fs'),
	dn('les', NOUN_FP, 'det-les', 'noun-fp'),
	n(NOUN_MS, 'noun-ms'),
	n(NOUN_MP, 'noun-mp'),
	n(NOUN_FS, 'noun-fs'),
	n(NOUN_FP, 'noun-fp'),
	dna(),
	npv()
];

const requireDatabaseUrl = () => {
	const url = process.env.PRIVATE_DATABASE_URL;
	if (!url) {
		throw new Error('PRIVATE_DATABASE_URL not set; e2e seed requires a test database.');
	}
	return url;
};

const getClient = (): NeonQueryFunction<false, false> => neon(requireDatabaseUrl());

export const seedE2eFixtures = async () => {
	const sql = getClient();

	await cleanupE2eFixtures();

	for (const entry of lexicalEntries) {
		await sql`
			INSERT INTO aud.lexical_entries (
				language, source, source_ref, surface, gender, number, category,
				phoneme_count, syllable_count, pld20
			) VALUES (
				${LANGUAGE}::aud.lang_code,
				${SOURCE_MARKER},
				${entry.ref},
				${entry.surface},
				${entry.gender ?? null},
				${entry.number ?? null},
				${entry.category ?? null},
				${entry.phonemeCount ?? null},
				${entry.syllableCount ?? null},
				${entry.pld20 ?? null}
			)
		`;
	}

	for (const spec of sentences) {
		await sql`
			INSERT INTO aud.generated_sentences (language, sentence, pattern)
			VALUES (${LANGUAGE}::aud.lang_code, ${spec.sentence}, ${spec.pattern})
		`;

		for (let i = 0; i < spec.tokens.length; i++) {
			const token = spec.tokens[i];
			const surface = lexicalEntries.find((e) => e.ref === token.entryRef)!.surface;
			await sql`
				INSERT INTO aud.generated_sentence_tokens (
					sentence_id, language, position, slot, surface, lexical_entry_id
				)
				SELECT
					s.id,
					s.language,
					${i + 1},
					${token.slot},
					${surface},
					le.id
				FROM aud.generated_sentences s
				JOIN aud.lexical_entries le
					ON le.language = s.language
					AND le.source = ${SOURCE_MARKER}
					AND le.source_ref = ${token.entryRef}
				WHERE s.language = ${LANGUAGE}::aud.lang_code
					AND s.sentence = ${spec.sentence}
			`;
		}

		if (spec.llm) {
			await sql`
				INSERT INTO aud.generated_sentence_classifications (
					sentence_id, judge_type, appropriate, grammatical, semantics, classifier_model
				)
				SELECT s.id, 'llm', ${spec.llm.appropriate}, ${spec.llm.grammatical},
					${spec.llm.semantics}, ${SOURCE_MARKER}
				FROM aud.generated_sentences s
				WHERE s.language = ${LANGUAGE}::aud.lang_code
					AND s.sentence = ${spec.sentence}
			`;
		}

		// Two acceptable votes → satisfies the ≥1-vote majority-accept rule.
		await sql`
			INSERT INTO aud.generated_sentence_classifications (sentence_id, judge_type, overall_acceptable)
			SELECT s.id, 'human', v.overall_acceptable
			FROM aud.generated_sentences s
			CROSS JOIN (VALUES (true), (true)) AS v(overall_acceptable)
			WHERE s.language = ${LANGUAGE}::aud.lang_code
				AND s.sentence = ${spec.sentence}
		`;
	}
};

/**
 * The highest classification id at this moment.
 *
 * The test database holds a real corpus, and a test that votes writes a row
 * against one of its sentences — which shifts the `vote_count` the candidate
 * query orders on, and so changes what every later test is offered.
 *
 * The id is a `bigserial`, strictly increasing and never reused, so it doubles
 * as a clock: everything written after the mark is what this test caused.
 * A transaction would be the usual tool and is not available here — the insert
 * happens in the preview server's connection, not the test's.
 *
 * The delete below is only safe because `playwright.config.ts` pins the suite to
 * one worker. Under parallel workers it would also remove a concurrent spec's
 * seed rows; that config comment explains the trade.
 */
export const classificationHighWaterMark = async (): Promise<number> => {
	const sql = getClient();
	const rows =
		await sql`SELECT COALESCE(MAX(id), 0)::int AS id FROM aud.generated_sentence_classifications`;
	return (rows[0] as { id: number }).id;
};

/** Removes every classification written since the given mark. */
export const rollbackClassificationsAfter = async (mark: number): Promise<void> => {
	const sql = getClient();
	await sql`DELETE FROM aud.generated_sentence_classifications WHERE id > ${mark}`;
};

export const cleanupE2eFixtures = async () => {
	const sql = getClient();

	for (const spec of sentences) {
		await sql`
			DELETE FROM aud.generated_sentences
			WHERE language = ${LANGUAGE}::aud.lang_code
				AND sentence = ${spec.sentence}
		`;
	}

	await sql`
		DELETE FROM aud.generated_sentences
		WHERE id IN (
			SELECT s.id
			FROM aud.generated_sentences s
			JOIN aud.generated_sentence_tokens t ON t.sentence_id = s.id
			JOIN aud.lexical_entries le ON le.id = t.lexical_entry_id
			WHERE le.source = ${SOURCE_MARKER}
		)
	`;
	await sql`DELETE FROM aud.lexical_entries WHERE source = ${SOURCE_MARKER}`;
};
