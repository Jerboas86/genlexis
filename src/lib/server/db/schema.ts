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

export const generatedSentenceClassifications = aud.table(
	'generated_sentence_classifications',
	{
		id: bigserial('id', { mode: 'number' }).primaryKey(),
		sentenceId: bigint('sentence_id', { mode: 'number' })
			.notNull()
			.references(() => generatedSentences.id, { onDelete: 'cascade' }),
		judgeType: text('judge_type').notNull(),
		classifiedAt: timestamp('classified_at', { withTimezone: true }).notNull().defaultNow(),
		appropriate: boolean('appropriate'),
		grammatical: boolean('grammatical'),
		semantics: text('semantics'),
		classifierModel: text('classifier_model'),
		classifierPromptHash: text('classifier_prompt_hash'),
		reactionP1: text('reaction_p1'),
		reactionP2: text('reaction_p2'),
		reactionP3: text('reaction_p3'),
		reasoningSoundP1: boolean('reasoning_sound_p1'),
		reasoningSoundP2: boolean('reasoning_sound_p2'),
		reasoningSoundP3: boolean('reasoning_sound_p3'),
		overallAcceptable: boolean('overall_acceptable'),
		notes: text('notes')
	},
	(t) => [
		check(
			'generated_sentence_classifications_judge_type_check',
			sql`${t.judgeType} IN ('llm', 'human')`
		),
		check(
			'generated_sentence_classifications_semantics_check',
			sql`${t.semantics} IS NULL OR ${t.semantics} IN ('natural', 'plausible', 'strained', 'nonsensical')`
		),
		check(
			'generated_sentence_classifications_shape_check',
			sql`(${t.judgeType} = 'llm' AND ${t.classifierModel} IS NOT NULL AND ${t.reasoningSoundP1} IS NULL AND ${t.reasoningSoundP2} IS NULL AND ${t.reasoningSoundP3} IS NULL AND ${t.overallAcceptable} IS NULL) OR (${t.judgeType} = 'human' AND ${t.classifierModel} IS NULL AND ${t.classifierPromptHash} IS NULL AND ${t.reactionP1} IS NULL AND ${t.reactionP2} IS NULL AND ${t.reactionP3} IS NULL)`
		),
		check(
			'generated_sentence_classifications_has_signal_check',
			sql`${t.appropriate} IS NOT NULL OR ${t.grammatical} IS NOT NULL OR ${t.semantics} IS NOT NULL OR ${t.overallAcceptable} IS NOT NULL`
		),
		uniqueIndex('classifications_one_llm_per_sentence')
			.on(t.sentenceId)
			.where(sql`${t.judgeType} = 'llm'`),
		index('classifications_sentence_judge_idx').on(t.sentenceId, t.judgeType),
		index('classifications_classified_at_idx').on(t.classifiedAt)
	]
);

export const latestLlmClassifications = aud.view('latest_llm_classifications', {
	sentenceId: bigint('sentence_id', { mode: 'number' }),
	appropriate: boolean('appropriate'),
	grammatical: boolean('grammatical'),
	semantics: text('semantics'),
	reactionP1: text('reaction_p1'),
	reactionP2: text('reaction_p2'),
	reactionP3: text('reaction_p3'),
	classifierModel: text('classifier_model'),
	classifierPromptHash: text('classifier_prompt_hash'),
	classifiedAt: timestamp('classified_at', { withTimezone: true })
}).as(sql`
		SELECT
			sentence_id, appropriate, grammatical, semantics,
			reaction_p1, reaction_p2, reaction_p3,
			classifier_model, classifier_prompt_hash, classified_at
		FROM aud.generated_sentence_classifications
		WHERE judge_type = 'llm'
	`);

export const humanClassificationSummaries = aud.view('human_classification_summaries', {
	sentenceId: bigint('sentence_id', { mode: 'number' }),
	language: langCode('language'),
	sentence: text('sentence'),
	pattern: text('pattern'),
	voteCount: bigint('vote_count', { mode: 'number' }),
	overallAcceptableCount: bigint('overall_acceptable_count', { mode: 'number' }),
	overallUnacceptableCount: bigint('overall_unacceptable_count', { mode: 'number' }),
	appropriateTrueCount: bigint('appropriate_true_count', { mode: 'number' }),
	appropriateFalseCount: bigint('appropriate_false_count', { mode: 'number' }),
	grammaticalTrueCount: bigint('grammatical_true_count', { mode: 'number' }),
	grammaticalFalseCount: bigint('grammatical_false_count', { mode: 'number' }),
	semanticsNaturalCount: bigint('semantics_natural_count', { mode: 'number' }),
	semanticsPlausibleCount: bigint('semantics_plausible_count', { mode: 'number' }),
	semanticsStrainedCount: bigint('semantics_strained_count', { mode: 'number' }),
	semanticsNonsensicalCount: bigint('semantics_nonsensical_count', { mode: 'number' }),
	reasoningUnsoundP1Count: bigint('reasoning_unsound_p1_count', { mode: 'number' }),
	reasoningUnsoundP2Count: bigint('reasoning_unsound_p2_count', { mode: 'number' }),
	reasoningUnsoundP3Count: bigint('reasoning_unsound_p3_count', { mode: 'number' })
}).as(sql`
		SELECT
			s.id        AS sentence_id,
			s.language,
			s.sentence,
			s.pattern,
			count(c.id) AS vote_count,
			count(*) FILTER (WHERE c.overall_acceptable IS TRUE)  AS overall_acceptable_count,
			count(*) FILTER (WHERE c.overall_acceptable IS FALSE) AS overall_unacceptable_count,
			count(*) FILTER (WHERE c.appropriate IS TRUE)  AS appropriate_true_count,
			count(*) FILTER (WHERE c.appropriate IS FALSE) AS appropriate_false_count,
			count(*) FILTER (WHERE c.grammatical IS TRUE)  AS grammatical_true_count,
			count(*) FILTER (WHERE c.grammatical IS FALSE) AS grammatical_false_count,
			count(*) FILTER (WHERE c.semantics = 'natural')     AS semantics_natural_count,
			count(*) FILTER (WHERE c.semantics = 'plausible')   AS semantics_plausible_count,
			count(*) FILTER (WHERE c.semantics = 'strained')    AS semantics_strained_count,
			count(*) FILTER (WHERE c.semantics = 'nonsensical') AS semantics_nonsensical_count,
			count(*) FILTER (WHERE c.reasoning_sound_p1 IS FALSE) AS reasoning_unsound_p1_count,
			count(*) FILTER (WHERE c.reasoning_sound_p2 IS FALSE) AS reasoning_unsound_p2_count,
			count(*) FILTER (WHERE c.reasoning_sound_p3 IS FALSE) AS reasoning_unsound_p3_count
		FROM aud.generated_sentences s
		LEFT JOIN aud.generated_sentence_classifications c
			ON c.sentence_id = s.id AND c.judge_type = 'human'
		GROUP BY s.id, s.language, s.sentence, s.pattern
	`);

export const sentenceAcceptance = aud.view('sentence_acceptance', {
	sentenceId: bigint('sentence_id', { mode: 'number' }),
	language: langCode('language'),
	sentence: text('sentence'),
	pattern: text('pattern'),
	accepted: boolean('accepted')
}).as(sql`
		SELECT
			s.id        AS sentence_id,
			s.language,
			s.sentence,
			s.pattern,
			CASE
				WHEN s.pattern IN ('noun', 'det_noun') THEN
					COALESCE(h.vote_count, 0) >= 1
					AND COALESCE(h.overall_acceptable_count, 0)
						>= COALESCE(h.overall_unacceptable_count, 0)
				ELSE
					llm.sentence_id IS NOT NULL
					AND derived.effective_appropriate
					AND derived.effective_grammatical
					AND derived.effective_semantics IN ('natural', 'plausible')
					AND (
						COALESCE(h.vote_count, 0) = 0
						OR COALESCE(h.overall_acceptable_count, 0)
							>= COALESCE(h.overall_unacceptable_count, 0)
					)
			END AS accepted
		FROM aud.generated_sentences s
		LEFT JOIN aud.human_classification_summaries h ON h.sentence_id = s.id
		LEFT JOIN aud.latest_llm_classifications    llm ON llm.sentence_id = s.id
		CROSS JOIN LATERAL (
			SELECT
				(llm.appropriate IS TRUE
					AND NOT EXISTS (
						SELECT 1
						FROM aud.generated_sentence_classifications c
						WHERE c.sentence_id = s.id
							AND c.judge_type = 'human'
							AND c.appropriate = FALSE
					)) AS effective_appropriate,
				(llm.grammatical IS TRUE
					OR (
						COALESCE(h.vote_count, 0) >= 1
						AND COALESCE(h.overall_acceptable_count, 0)
							>= COALESCE(h.overall_unacceptable_count, 0)
					)) AS effective_grammatical,
				COALESCE(
					(
						SELECT c.semantics
						FROM aud.generated_sentence_classifications c
						WHERE c.sentence_id = s.id
							AND c.judge_type = 'human'
							AND c.semantics IS NOT NULL
						GROUP BY c.semantics
						ORDER BY count(*) DESC,
								 (c.semantics = llm.semantics) DESC
						LIMIT 1
					),
					llm.semantics
				) AS effective_semantics
		) derived
	`);

export * from './auth.schema';
