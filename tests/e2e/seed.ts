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
const FIXTURE_SUFFIX = fixtureNamespace.replace(/-/g, '') || 'local';
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
};

type SentenceSpec = {
	ref: string;
	sentence: string;
	pattern: 'det_noun' | 'noun';
	tokens: { slot: 'det' | 'noun'; entryRef: string }[];
};

// Made-up noun surfaces avoid clashing with real production lexicon.
export const NOUN_MS = `xetax${FIXTURE_SUFFIX}`;
export const NOUN_MP = `xetaxs${FIXTURE_SUFFIX}`;
export const NOUN_FS = `yutame${FIXTURE_SUFFIX}`;
export const NOUN_FP = `yutames${FIXTURE_SUFFIX}`;

const lexicalEntries: LexicalEntrySpec[] = [
	{ ref: 'det-le', surface: 'le', gender: 'm', number: 's', category: 'det' },
	{ ref: 'det-la', surface: 'la', gender: 'f', number: 's', category: 'det' },
	{ ref: 'det-les', surface: 'les', number: 'p', category: 'det' },
	{ ref: 'det-un', surface: 'un', gender: 'm', number: 's', category: 'det' },
	{ ref: 'det-une', surface: 'une', gender: 'f', number: 's', category: 'det' },
	{
		ref: 'noun-ms',
		surface: NOUN_MS,
		gender: 'm',
		number: 's',
		category: 'noun',
		phonemeCount: FIXTURE_PHONEME_COUNT
	},
	{
		ref: 'noun-mp',
		surface: NOUN_MP,
		gender: 'm',
		number: 'p',
		category: 'noun',
		phonemeCount: FIXTURE_PHONEME_COUNT
	},
	{
		ref: 'noun-fs',
		surface: NOUN_FS,
		gender: 'f',
		number: 's',
		category: 'noun',
		phonemeCount: FIXTURE_PHONEME_COUNT
	},
	{
		ref: 'noun-fp',
		surface: NOUN_FP,
		gender: 'f',
		number: 'p',
		category: 'noun',
		phonemeCount: FIXTURE_PHONEME_COUNT
	}
];

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
	n(NOUN_FP, 'noun-fp')
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
				language, source, source_ref, surface, gender, number, category, phoneme_count
			) VALUES (
				${LANGUAGE}::aud.lang_code,
				${SOURCE_MARKER},
				${entry.ref},
				${entry.surface},
				${entry.gender ?? null},
				${entry.number ?? null},
				${entry.category ?? null},
				${entry.phonemeCount ?? null}
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

		// Two correct votes → validation_status = 'accepted'.
		await sql`
			INSERT INTO aud.generated_sentence_validations (sentence_id, is_correct)
			SELECT s.id, v.is_correct
			FROM aud.generated_sentences s
			CROSS JOIN (VALUES (true), (true)) AS v(is_correct)
			WHERE s.language = ${LANGUAGE}::aud.lang_code
				AND s.sentence = ${spec.sentence}
		`;
	}
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
