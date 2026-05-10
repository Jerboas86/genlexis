import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

const SOURCE_MARKER = 'e2e-genlexis-test';
const LANGUAGE = 'fr-FR';

type LexicalEntrySpec = {
	ref: string;
	surface: string;
	gender?: 'm' | 'f';
	number?: 's' | 'p';
	category?: string;
};

type SentenceSpec = {
	ref: string;
	sentence: string;
	pattern: 'det_noun' | 'noun';
	tokens: { slot: 'det' | 'noun'; entryRef: string }[];
};

type DbId = string;

// Made-up noun surfaces avoid clashing with real production lexicon.
export const NOUN_MS = 'xetax';
export const NOUN_MP = 'xetaxs';
export const NOUN_FS = 'yutame';
export const NOUN_FP = 'yutames';

const lexicalEntries: LexicalEntrySpec[] = [
	{ ref: 'det-le', surface: 'le', gender: 'm', number: 's', category: 'det' },
	{ ref: 'det-la', surface: 'la', gender: 'f', number: 's', category: 'det' },
	{ ref: 'det-les', surface: 'les', number: 'p', category: 'det' },
	{ ref: 'det-un', surface: 'un', gender: 'm', number: 's', category: 'det' },
	{ ref: 'det-une', surface: 'une', gender: 'f', number: 's', category: 'det' },
	{ ref: 'noun-ms', surface: NOUN_MS, gender: 'm', number: 's', category: 'noun' },
	{ ref: 'noun-mp', surface: NOUN_MP, gender: 'm', number: 'p', category: 'noun' },
	{ ref: 'noun-fs', surface: NOUN_FS, gender: 'f', number: 's', category: 'noun' },
	{ ref: 'noun-fp', surface: NOUN_FP, gender: 'f', number: 'p', category: 'noun' }
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

	const insertedEntries = new Map<string, DbId>();
	for (const entry of lexicalEntries) {
		const rows = (await sql`
			INSERT INTO aud.lexical_entries (
				language, source, source_ref, surface, gender, number, category
			) VALUES (
				${LANGUAGE}::aud.lang_code,
				${SOURCE_MARKER},
				${entry.ref},
				${entry.surface},
				${entry.gender ?? null},
				${entry.number ?? null},
				${entry.category ?? null}
			) RETURNING id
		`) as { id: DbId }[];
		insertedEntries.set(entry.ref, rows[0].id);
	}

	for (const spec of sentences) {
		const sentenceRows = (await sql`
			INSERT INTO aud.generated_sentences (language, sentence, pattern)
			VALUES (${LANGUAGE}::aud.lang_code, ${spec.sentence}, ${spec.pattern})
			RETURNING id
		`) as { id: DbId }[];
		const sentenceId = sentenceRows[0].id;

		for (let i = 0; i < spec.tokens.length; i++) {
			const token = spec.tokens[i];
			const entryId = insertedEntries.get(token.entryRef);
			if (!entryId) throw new Error(`Missing seeded entry ${token.entryRef}`);
			const surface = lexicalEntries.find((e) => e.ref === token.entryRef)!.surface;
			await sql`
				INSERT INTO aud.generated_sentence_tokens (
					sentence_id, language, position, slot, surface, lexical_entry_id
				) VALUES (
					${sentenceId},
					${LANGUAGE}::aud.lang_code,
					${i + 1},
					${token.slot},
					${surface},
					${entryId}
				)
			`;
		}

		// Two correct votes → validation_status = 'accepted'.
		await sql`
			INSERT INTO aud.generated_sentence_validations (sentence_id, is_correct)
			VALUES (${sentenceId}, true), (${sentenceId}, true)
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
