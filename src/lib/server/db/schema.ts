import { sql } from 'drizzle-orm';
import {
	bigint,
	bigserial,
	boolean,
	check,
	customType,
	foreignKey,
	index,
	integer,
	numeric,
	pgSchema,
	primaryKey,
	text,
	timestamp,
	unique,
	uniqueIndex
} from 'drizzle-orm/pg-core';

const aud = pgSchema('aud');

const langCode = customType<{ data: string; driverData: string }>({
	dataType() {
		return 'aud.lang_code';
	}
});

export const lexicalEntries = aud.table(
	'lexical_entries',
	{
		id: bigserial('id', { mode: 'number' }).primaryKey(),
		language: langCode('language').notNull(),
		source: text('source').notNull(),
		sourceRef: text('source_ref').notNull(),
		surface: text('surface').notNull(),
		lemma: text('lemma'),
		category: text('category'),
		orthoCategory: text('ortho_category'),
		gender: text('gender'),
		number: text('number'),
		verbInfo: text('verb_info'),
		frequency: numeric('frequency'),
		phono: text('phono'),
		phonoIpa: text('phono_ipa'),
		frequencyOrtho: numeric('frequency_ortho'),
		frequencyLemma: numeric('frequency_lemma'),
		cdOrtho: numeric('cd_ortho'),
		isLemma: boolean('is_lemma'),
		letterCount: integer('letter_count'),
		phonemeCount: integer('phoneme_count'),
		old20: numeric('old20'),
		pld20: numeric('pld20'),
		cvOrtho: text('cv_ortho'),
		cvPhono: text('cv_phono'),
		voisOrtho: integer('vois_ortho'),
		voisPhono: integer('vois_phono'),
		homographCount: integer('homograph_count'),
		homophoneCount: integer('homophone_count'),
		syllPhono: text('syll_phono'),
		syllableCount: integer('syllable_count'),
		syllCv: text('syll_cv'),
		puOrtho: integer('pu_ortho'),
		puPhon: integer('pu_phon'),
		morphoBase: text('morpho_base'),
		morphoStruct: text('morpho_struct'),
		morphoDecomp: text('morpho_decomp'),
		preval: numeric('preval'),
		prevalCount: integer('preval_count'),
		rtFlp: numeric('rt_flp'),
		zrtFlp: numeric('zrt_flp'),
		errFlp: numeric('err_flp'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		check('lexical_entries_source_not_empty', sql`${t.source} <> ''`),
		check('lexical_entries_surface_not_empty', sql`${t.surface} <> ''`),
		unique('lexical_entries_source_ref_unique').on(t.language, t.source, t.sourceRef),
		uniqueIndex('lexical_entries_id_language_idx').on(t.id, t.language),
		index('lexical_entries_language_surface_idx').on(t.language, t.surface),
		index('lexical_entries_language_lemma_idx').on(t.language, t.lemma),
		index('lexical_entries_source_idx').on(t.source)
	]
);

export const generatedSentences = aud.table(
	'generated_sentences',
	{
		id: bigserial('id', { mode: 'number' }).primaryKey(),
		language: langCode('language').notNull().default('fr-FR'),
		sentence: text('sentence').notNull(),
		pattern: text('pattern').notNull(),
		generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		uniqueIndex('generated_sentences_language_sentence_idx').on(t.language, t.sentence),
		uniqueIndex('generated_sentences_id_language_idx').on(t.id, t.language),
		index('generated_sentences_pattern_idx').on(t.language, t.pattern)
	]
);

export const generatedSentenceTokens = aud.table(
	'generated_sentence_tokens',
	{
		sentenceId: bigint('sentence_id', { mode: 'number' }).notNull(),
		language: langCode('language').notNull(),
		position: integer('position').notNull(),
		slot: text('slot').notNull(),
		surface: text('surface').notNull(),
		lexicalEntryId: bigint('lexical_entry_id', { mode: 'number' })
	},
	(t) => [
		primaryKey({ columns: [t.sentenceId, t.position] }),
		foreignKey({
			columns: [t.sentenceId, t.language],
			foreignColumns: [generatedSentences.id, generatedSentences.language]
		}).onDelete('cascade'),
		foreignKey({
			columns: [t.lexicalEntryId, t.language],
			foreignColumns: [lexicalEntries.id, lexicalEntries.language]
		}),
		check('generated_sentence_tokens_position_positive', sql`${t.position} > 0`),
		check('generated_sentence_tokens_slot_not_empty', sql`${t.slot} <> ''`),
		check('generated_sentence_tokens_surface_not_empty', sql`${t.surface} <> ''`),
		index('generated_sentence_tokens_surface_idx').on(t.language, t.surface),
		index('generated_sentence_tokens_slot_idx').on(t.language, t.slot),
		index('generated_sentence_tokens_lexical_entry_idx').on(t.lexicalEntryId)
	]
);

export const generatedSentenceValidations = aud.table(
	'generated_sentence_validations',
	{
		id: bigserial('id', { mode: 'number' }).primaryKey(),
		sentenceId: bigint('sentence_id', { mode: 'number' })
			.notNull()
			.references(() => generatedSentences.id, { onDelete: 'cascade' }),
		isCorrect: boolean('is_correct').notNull(),
		validatedAt: timestamp('validated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		index('generated_sentence_validations_sentence_idx').on(t.sentenceId),
		index('generated_sentence_validations_validated_at_idx').on(t.validatedAt)
	]
);

export const generatedSentenceValidationSummaries = aud.view(
	'generated_sentence_validation_summaries',
	{
		sentenceId: bigint('sentence_id', { mode: 'number' }),
		language: langCode('language'),
		sentence: text('sentence'),
		pattern: text('pattern'),
		voteCount: bigint('vote_count', { mode: 'number' }),
		correctCount: bigint('correct_count', { mode: 'number' }),
		incorrectCount: bigint('incorrect_count', { mode: 'number' }),
		validationStatus: text('validation_status')
	}
).as(sql`
		SELECT
			s.id AS sentence_id,
			s.language,
			s.sentence,
			s.pattern,
			count(v.id) AS vote_count,
			count(*) FILTER (WHERE v.is_correct) AS correct_count,
			count(*) FILTER (WHERE NOT v.is_correct) AS incorrect_count,
			CASE
				WHEN count(v.id) = 0 THEN 'unreviewed'
				WHEN count(v.id) < 2 THEN 'needs_more_votes'
				WHEN count(*) FILTER (WHERE v.is_correct) > count(*) FILTER (WHERE NOT v.is_correct)
					THEN 'accepted'
				WHEN count(*) FILTER (WHERE NOT v.is_correct) > count(*) FILTER (WHERE v.is_correct)
					THEN 'rejected'
				ELSE 'needs_more_votes'
			END AS validation_status
		FROM aud.generated_sentences s
		LEFT JOIN aud.generated_sentence_validations v
			ON v.sentence_id = s.id
		GROUP BY s.id, s.language, s.sentence, s.pattern
	`);

export * from './auth.schema';
