import { sql } from 'drizzle-orm';
import {
	bigint,
	bigserial,
	boolean,
	check,
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

/**
 * The schema this repository owns outright — and, since lot C of
 * `specs/shared-database-ownership.md` (Helixum repository), the only one it
 * declares. `aud` is Helixum's. A repository that does not declare a schema
 * cannot delete anything in it, which is what makes `drizzle-kit push` safe
 * by construction rather than by discipline.
 */
export const genlexis = pgSchema('genlexis');

/**
 * The language of a corpus row.
 *
 * Declared and exported so drizzle-kit sees it — it only sees exports — and
 * declared here rather than in `aud`, where the same enum still serves
 * Helixum's tables: a `genlexis` column typed by an `aud` type is a dependency
 * across the ownership line, and drizzle-kit cannot even represent it.
 */
export const langCode = genlexis.enum('lang_code', [
	'fr-FR',
	'en-US',
	'en-GB',
	'es-ES',
	'de-DE',
	'it-IT'
]);

export const lexicalEntries = genlexis.table(
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
		unique('lexical_entries_id_language_idx').on(t.id, t.language),
		index('lexical_entries_language_surface_idx').on(t.language, t.surface),
		index('lexical_entries_language_lemma_idx').on(t.language, t.lemma),
		index('lexical_entries_source_idx').on(t.source)
	]
);

export const generatedSentences = genlexis.table(
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
		unique('generated_sentences_id_language_idx').on(t.id, t.language),
		index('generated_sentences_pattern_idx').on(t.language, t.pattern)
	]
);

export const generatedSentenceTokens = genlexis.table(
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
		// Named as the database names them, so that `push` finds nothing to redo.
		primaryKey({ name: 'generated_sentence_tokens_pkey', columns: [t.sentenceId, t.position] }),
		foreignKey({
			name: 'generated_sentence_tokens_sentence_id_language_fkey',
			columns: [t.sentenceId, t.language],
			foreignColumns: [generatedSentences.id, generatedSentences.language]
		}).onDelete('cascade'),
		foreignKey({
			name: 'generated_sentence_tokens_lexical_entry_id_language_fkey',
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

export const generatedSentenceClassifications = genlexis.table(
	'generated_sentence_classifications',
	{
		id: bigserial('id', { mode: 'number' }).primaryKey(),
		sentenceId: bigint('sentence_id', { mode: 'number' }).notNull(),
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
		foreignKey({
			name: 'generated_sentence_classifications_sentence_id_fkey',
			columns: [t.sentenceId],
			foreignColumns: [generatedSentences.id]
		}).onDelete('cascade'),
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

/**
 * The phoneme distribution of a language, which every balanced draw reads.
 *
 * Declared for the first time: it used to be reached by a configuration string
 * alone, declared by neither repository, and survived every push by being
 * invisible rather than by being protected. Names follow the database.
 */
export const languagePhonemeDistributions = genlexis.table(
	'language_phoneme_distributions',
	{
		language: langCode('language').notNull(),
		phoneme: text('phoneme').notNull(),
		frequency: numeric('frequency').notNull()
	},
	(t) => [
		primaryKey({ name: 'language_phoneme_distributions_pk', columns: [t.language, t.phoneme] }),
		check(
			'language_phoneme_distributions_frequency_range',
			sql`${t.frequency} >= 0 AND ${t.frequency} <= 1`
		)
	]
);

export const latestLlmClassifications = genlexis
	.view('latest_llm_classifications', {
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
	})
	.existing();

export const humanClassificationSummaries = genlexis
	.view('human_classification_summaries', {
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
	})
	.existing();

export const sentenceAcceptance = genlexis
	.view('sentence_acceptance', {
		sentenceId: bigint('sentence_id', { mode: 'number' }),
		language: langCode('language'),
		sentence: text('sentence'),
		pattern: text('pattern'),
		accepted: boolean('accepted')
	})
	.existing();

/**
 * A draw served to a consumer, and the exact items it contained.
 *
 * These two tables exist so a `drawId` can be *resolved*. A consumer rotating
 * away from its recent sessions sends only identifiers; the service is the
 * normative authority on what those identifiers contained, because a client that
 * has lost its local history would otherwise silently weaken the rotation.
 *
 * A row is never updated. A correction publishes a new draw, and the old one
 * keeps naming exactly what it served.
 */
export const materialDraws = genlexis.table(
	'material_draws',
	{
		/** Opaque, random and non-derivable — never a sequence. */
		drawId: text('draw_id').primaryKey(),
		protocolRevision: text('protocol_revision').notNull(),
		materialSourceId: text('material_source_id').notNull(),
		materialRelease: text('material_release').notNull(),
		/**
		 * The pool the draw ran against.
		 *
		 * A seed alone does not make a draw replayable: the same seed against a
		 * changed pool produces different sentences.
		 */
		poolRevision: text('pool_revision').notNull(),
		language: text('language').notNull(),
		seed: text('seed').notNull(),
		/** The generation options, as the response reported them. */
		options: text('options').notNull(),
		phonemeBalanceDistance: numeric('phoneme_balance_distance').notNull(),
		/**
		 * The tolerance this draw was judged against.
		 *
		 * Stored rather than read back from the registry, so a replay reports the
		 * threshold that actually applied — a revision republished with another
		 * one must not retroactively change what a served draw claims to have met.
		 */
		phonemeBalanceTolerance: numeric('phoneme_balance_tolerance').notNull(),
		issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('material_draws_protocol_idx').on(t.protocolRevision, t.issuedAt)]
);

export const materialDrawItems = genlexis.table(
	'material_draw_items',
	{
		drawId: text('draw_id').notNull(),
		position: integer('position').notNull(),
		itemId: text('item_id').notNull(),
		/**
		 * Derived from the sentence text, so a correction is a new revision by
		 * construction rather than by anyone remembering to bump a column.
		 */
		itemRevision: text('item_revision').notNull(),
		/**
		 * The text as it was served.
		 *
		 * Stored rather than re-read from `generated_sentences`, because
		 * `item_revision` is derived from it: a sentence corrected after a draw
		 * cited it would otherwise be replayed as the *new* text under the *old*
		 * revision, and the two would contradict each other. A draw must keep
		 * naming exactly what it served.
		 */
		text: text('text').notNull(),
		sentenceId: bigint('sentence_id', { mode: 'number' }).notNull()
	},
	(t) => [
		// Named as PostgreSQL named them when `database/001-genlexis-material.sql`
		// created the tables: a declaration that let Drizzle choose its own names
		// makes `push` propose dropping and recreating constraints that already
		// match.
		primaryKey({ name: 'material_draw_items_pkey', columns: [t.drawId, t.position] }),
		foreignKey({
			name: 'material_draw_items_draw_id_fkey',
			columns: [t.drawId],
			foreignColumns: [materialDraws.drawId]
		}).onDelete('cascade'),
		// The rotation resolves excluded draws to these pairs, so this is the
		// index the exclusion query runs on.
		index('material_draw_items_identity_idx').on(t.itemId, t.itemRevision),
		index('material_draw_items_draw_idx').on(t.drawId)
	]
);

/**
 * The idempotency ledger.
 *
 * The fingerprint is the canonical form of the request — contract version,
 * protocol revision, and the sorted, de-duplicated exclusions. The same key with
 * the same fingerprint replays the stored draw; the same key with any other
 * fingerprint is a conflict rather than a second draw.
 *
 * The key is an HMAC digest the consumer derives from a stable preparation
 * identifier. It is never a session or account identifier, and nothing here ties
 * it to a person.
 */
export const materialIdempotency = genlexis.table(
	'material_idempotency',
	{
		idempotencyKey: text('idempotency_key').primaryKey(),
		fingerprint: text('fingerprint').notNull(),
		drawId: text('draw_id').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		/** Retention covers the retry, rotation and transfer windows, then lapses. */
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull()
	},
	(t) => [
		index('material_idempotency_expiry_idx').on(t.expiresAt),
		foreignKey({
			name: 'material_idempotency_draw_id_fkey',
			columns: [t.drawId],
			foreignColumns: [materialDraws.drawId]
		}).onDelete('cascade')
	]
);

/*
 * There is deliberately no `auth` schema here.
 *
 * `auth.schema.ts` existed as an empty `export {}` and was re-exported from this
 * file. Regenerating it — `pnpm auth:schema` does exactly that — would have made
 * Genlexis declare the nine account tables of a database it *shares* with
 * Helixum, and `drizzle-kit push` proposes to drop what a declared schema does
 * not contain. Helixum owns those tables; this repository must never claim them.
 *
 * Nothing needs it at runtime: better-auth itself is gone from this repository.
 * Nothing ever read `locals.user`, no route signed anyone in, and its default
 * mapping pointed at a `public.user` that does not exist — it had never done
 * anything but return `null`, until 1.7 made it refuse to start on that.
 *
 * See `specs/shared-database-ownership.md` in the Helixum repository.
 */
