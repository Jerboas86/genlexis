-- Centralises the sentence acceptance rule for simple and complex patterns.
-- See acceptance_rule_plan.md for the rationale.
--
-- Simple patterns (noun, det_noun): human votes only.
--   accepted iff vote_count >= 1 AND overall_acceptable_count >= overall_unacceptable_count.
--
-- Complex patterns (e.g. det_noun_adj): LLM verdict is a hard prerequisite;
-- humans act as reviewers under a unified 1-vote rule.
--   accepted iff
--     LLM verdict exists
--     AND effective_appropriate (LLM TRUE, no human flagged appropriate=FALSE)
--     AND effective_grammatical (LLM TRUE, OR human 1-vote holistic majority overrides)
--     AND effective_semantics IN ('natural', 'plausible')
--         (human-majority reclassification can flip any of the four labels;
--          ties keep the LLM label)
--     AND (no human votes OR human holistic majority is accept).

BEGIN;

CREATE OR REPLACE VIEW aud.sentence_acceptance AS
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
        -- Veto-by-one: appropriateness is a safety gate.
        (llm.appropriate IS TRUE
            AND NOT EXISTS (
                SELECT 1
                FROM aud.generated_sentence_classifications c
                WHERE c.sentence_id = s.id
                  AND c.judge_type = 'human'
                  AND c.appropriate = FALSE
            )) AS effective_appropriate,

        -- Humans can override an LLM "ungrammatical" verdict with a 1-vote holistic majority.
        (llm.grammatical IS TRUE
            OR (
                COALESCE(h.vote_count, 0) >= 1
                AND COALESCE(h.overall_acceptable_count, 0)
                    >= COALESCE(h.overall_unacceptable_count, 0)
            )) AS effective_grammatical,

        -- Human semantics majority overrides any LLM label; ties keep the LLM label.
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
) derived;

COMMIT;
