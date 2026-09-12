import { sql } from 'drizzle-orm';
import { createDrizzleGenerationRepository } from '@genlexis/core/adapters/drizzle';
import {
	DEFAULT_PATTERNS,
	frenchLanguagePreset,
	type GenlexisRepository,
	type HumanClassificationInput,
	type SemanticsLabel,
	type SentenceSummary,
	type SupportedPattern
} from '@genlexis/core';
import { db } from '$lib/server/db';
import { generatedSentenceClassifications } from '$lib/server/db/schema';

type LlmRow = Omit<SentenceSummary, 'llm'> & {
	llmAppropriate: boolean | null;
	llmGrammatical: boolean | null;
	llmSemantics: SemanticsLabel | null;
	hasLlm: boolean;
};

const generationRepository = createDrizzleGenerationRepository(db, {
	schema: {
		acceptanceView: 'genlexis.sentence_acceptance',
		tokensTable: 'genlexis.generated_sentence_tokens',
		lexicalEntriesTable: 'genlexis.lexical_entries',
		phonemeDistributionTable: 'genlexis.language_phoneme_distributions',
		classificationsTable: 'genlexis.generated_sentence_classifications',
		humanSummariesView: 'genlexis.human_classification_summaries',
		latestLlmView: 'genlexis.latest_llm_classifications'
	},
	slots: { det: 'det', noun: 'noun', adj: 'adj', verb: 'verb' },
	patterns: DEFAULT_PATTERNS,
	preset: frenchLanguagePreset
});

const validationRepository = {
	async findLeastVotedValidationCandidate(
		pattern?: SupportedPattern
	): Promise<SentenceSummary | null> {
		const patternFilter = pattern ? sql`AND h.pattern = ${pattern}` : sql``;

		const result = await db.execute<LlmRow>(sql`
			SELECT
				h.sentence_id::int AS "sentenceId",
				h.sentence,
				h.pattern,
				h.vote_count::int AS "voteCount",
				h.overall_acceptable_count::int AS "overallAcceptableCount",
				h.overall_unacceptable_count::int AS "overallUnacceptableCount",
				l.appropriate AS "llmAppropriate",
				l.grammatical AS "llmGrammatical",
				l.semantics AS "llmSemantics",
				(l.sentence_id IS NOT NULL) AS "hasLlm"
			FROM genlexis.human_classification_summaries h
			LEFT JOIN genlexis.latest_llm_classifications l ON l.sentence_id = h.sentence_id
			WHERE h.pattern <> 'noun'
			AND (h.pattern NOT IN ('det_noun_adj', 'np_verb') OR l.sentence_id IS NOT NULL)
			${patternFilter}
			ORDER BY h.vote_count ASC, random()
			LIMIT 1
		`);

		const rows = Array.isArray(result) ? result : result.rows;
		const row = rows[0];
		if (!row) return null;

		const { llmAppropriate, llmGrammatical, llmSemantics, hasLlm, ...summary } = row;
		return {
			...summary,
			llm: hasLlm
				? {
						appropriate: llmAppropriate,
						grammatical: llmGrammatical,
						semantics: llmSemantics
					}
				: null
		};
	},

	async recordValidation(sentenceId: number, isCorrect: boolean): Promise<void> {
		await db
			.insert(generatedSentenceClassifications)
			.values({ sentenceId, judgeType: 'human', overallAcceptable: isCorrect });
	},

	async recordHumanClassification(
		sentenceId: number,
		input: HumanClassificationInput
	): Promise<void> {
		await db.insert(generatedSentenceClassifications).values({
			sentenceId,
			judgeType: 'human',
			appropriate: input.appropriate,
			grammatical: input.grammatical,
			semantics: input.semantics
		});
	}
};

export const repository: GenlexisRepository = {
	...generationRepository,
	...validationRepository
};
