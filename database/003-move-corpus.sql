-- Lot C — le corpus quitte `aud` pour `genlexis`.
--
-- `aud` est partagé entre Genlexis et Helixum, et chacun n'en déclare qu'une
-- partie : c'est ce qui rend tout `push` dangereux depuis l'un ou l'autre côté
-- (`specs/shared-database-ownership.md`, dans le dépôt Helixum). Après ceci,
-- `aud` ne contient plus que des tables d'Helixum, et `genlexis` tout ce qui est
-- à Genlexis — chaque dépôt déclare un schéma qu'il possède entièrement.
--
-- Ce qui bouge : cinq tables (leurs séquences suivent), trois vues, et le type
-- de langue, qui reçoit un homologue `genlexis.lang_code` pour que plus aucune
-- table de `genlexis` ne dépende d'un type de `aud`. Aucune clé étrangère ne
-- traverse la frontière ; vérifié avant d'écrire.
--
-- Fenêtre de compatibilité : des vues portant les anciens noms restent dans
-- `aud` et pointent vers les tables déplacées, pour que le code déployé qui lit
-- encore `aud.*` continue de fonctionner le temps de basculer. Elles sont
-- retirées par `004-drop-corpus-compat.sql` une fois les deux Workers
-- redéployés. Ces vues simples sont modifiables (INSERT/UPDATE/DELETE), donc les
-- votes de `/classify` passent aussi pendant la fenêtre.
--
-- Une seule transaction : tout ou rien.
--
--   doppler run -p genlexis -c dev -- \
--     psql "$PRIVATE_DATABASE_URL" -v ON_ERROR_STOP=1 -f database/003-move-corpus.sql

BEGIN;

-- 1. Les vues d'abord : on ne peut pas changer le type d'une colonne qu'une
--    vue lit, et elles sont recréées dans leur nouveau schéma plus bas.
DROP VIEW IF EXISTS aud.sentence_acceptance;
DROP VIEW IF EXISTS aud.human_classification_summaries;
DROP VIEW IF EXISTS aud.latest_llm_classifications;

-- 2. Le type de langue, chez lui.
DO $$ BEGIN
    CREATE TYPE genlexis.lang_code AS ENUM ('fr-FR', 'en-US', 'en-GB', 'es-ES', 'de-DE', 'it-IT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Les tables. Les séquences qu'elles possèdent suivent.
ALTER TABLE aud.lexical_entries                    SET SCHEMA genlexis;
ALTER TABLE aud.generated_sentences                SET SCHEMA genlexis;
ALTER TABLE aud.generated_sentence_tokens          SET SCHEMA genlexis;
ALTER TABLE aud.generated_sentence_classifications SET SCHEMA genlexis;
ALTER TABLE aud.language_phoneme_distributions     SET SCHEMA genlexis;

-- 4. Les colonnes de langue passent au type de `genlexis`. Les valeurs sont
--    les mêmes libellés ; le passage par `text` est la conversion entre deux
--    enums distincts. Deux clés étrangères composites incluent `language` des
--    deux côtés, et PostgreSQL refuse qu'une colonne change de type tant que
--    l'autre bout ne l'a pas fait : elles sont suspendues le temps de la
--    conversion et reposées à l'identique. La répétition à blanc l'a trouvé.
ALTER TABLE genlexis.generated_sentence_tokens
    DROP CONSTRAINT generated_sentence_tokens_sentence_id_language_fkey,
    DROP CONSTRAINT generated_sentence_tokens_lexical_entry_id_language_fkey;

ALTER TABLE genlexis.lexical_entries
    ALTER COLUMN language TYPE genlexis.lang_code USING language::text::genlexis.lang_code;
ALTER TABLE genlexis.generated_sentences
    ALTER COLUMN language DROP DEFAULT,
    ALTER COLUMN language TYPE genlexis.lang_code USING language::text::genlexis.lang_code,
    ALTER COLUMN language SET DEFAULT 'fr-FR';
ALTER TABLE genlexis.generated_sentence_tokens
    ALTER COLUMN language TYPE genlexis.lang_code USING language::text::genlexis.lang_code;
ALTER TABLE genlexis.language_phoneme_distributions
    ALTER COLUMN language TYPE genlexis.lang_code USING language::text::genlexis.lang_code;

ALTER TABLE genlexis.generated_sentence_tokens
    ADD CONSTRAINT generated_sentence_tokens_sentence_id_language_fkey
        FOREIGN KEY (sentence_id, language) REFERENCES genlexis.generated_sentences (id, language) ON DELETE CASCADE,
    ADD CONSTRAINT generated_sentence_tokens_lexical_entry_id_language_fkey
        FOREIGN KEY (lexical_entry_id, language) REFERENCES genlexis.lexical_entries (id, language);

-- 4 bis. Les deux index uniques sur lesquels s'adossent les clés composites
--    deviennent des contraintes, en réutilisant l'index : drizzle-kit ne
--    reconnaît une cible de clé étrangère que sous cette forme, et proposait
--    sinon de les recréer à chaque push.
DO $$ BEGIN
    ALTER TABLE genlexis.lexical_entries
        ADD CONSTRAINT lexical_entries_id_language_idx UNIQUE USING INDEX lexical_entries_id_language_idx;
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE genlexis.generated_sentences
        ADD CONSTRAINT generated_sentences_id_language_idx UNIQUE USING INDEX generated_sentences_id_language_idx;
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;

-- 5. Les vues, dans leur schéma, telles qu'elles étaient — seuls les schémas
--    référencés changent.
CREATE VIEW genlexis.latest_llm_classifications AS
SELECT sentence_id,
    appropriate,
    grammatical,
    semantics,
    reaction_p1,
    reaction_p2,
    reaction_p3,
    classifier_model,
    classifier_prompt_hash,
    classified_at
   FROM genlexis.generated_sentence_classifications
  WHERE judge_type = 'llm'::text;

CREATE VIEW genlexis.human_classification_summaries AS
SELECT s.id AS sentence_id,
    s.language,
    s.sentence,
    s.pattern,
    count(c.id) AS vote_count,
    count(*) FILTER (WHERE c.overall_acceptable IS TRUE) AS overall_acceptable_count,
    count(*) FILTER (WHERE c.overall_acceptable IS FALSE) AS overall_unacceptable_count,
    count(*) FILTER (WHERE c.appropriate IS TRUE) AS appropriate_true_count,
    count(*) FILTER (WHERE c.appropriate IS FALSE) AS appropriate_false_count,
    count(*) FILTER (WHERE c.grammatical IS TRUE) AS grammatical_true_count,
    count(*) FILTER (WHERE c.grammatical IS FALSE) AS grammatical_false_count,
    count(*) FILTER (WHERE c.semantics = 'natural'::text) AS semantics_natural_count,
    count(*) FILTER (WHERE c.semantics = 'plausible'::text) AS semantics_plausible_count,
    count(*) FILTER (WHERE c.semantics = 'strained'::text) AS semantics_strained_count,
    count(*) FILTER (WHERE c.semantics = 'nonsensical'::text) AS semantics_nonsensical_count,
    count(*) FILTER (WHERE c.reasoning_sound_p1 IS FALSE) AS reasoning_unsound_p1_count,
    count(*) FILTER (WHERE c.reasoning_sound_p2 IS FALSE) AS reasoning_unsound_p2_count,
    count(*) FILTER (WHERE c.reasoning_sound_p3 IS FALSE) AS reasoning_unsound_p3_count
   FROM genlexis.generated_sentences s
     LEFT JOIN genlexis.generated_sentence_classifications c ON c.sentence_id = s.id AND c.judge_type = 'human'::text
  GROUP BY s.id, s.language, s.sentence, s.pattern;

CREATE VIEW genlexis.sentence_acceptance AS
SELECT s.id AS sentence_id,
    s.language,
    s.sentence,
    s.pattern,
        CASE
            WHEN s.pattern = ANY (ARRAY['noun'::text, 'det_noun'::text]) THEN COALESCE(h.vote_count, 0::bigint) >= 1 AND COALESCE(h.overall_acceptable_count, 0::bigint) >= COALESCE(h.overall_unacceptable_count, 0::bigint)
            ELSE llm.sentence_id IS NOT NULL AND derived.effective_appropriate AND derived.effective_grammatical AND (derived.effective_semantics = ANY (ARRAY['natural'::text, 'plausible'::text])) AND (COALESCE(h.vote_count, 0::bigint) = 0 OR COALESCE(h.overall_acceptable_count, 0::bigint) >= COALESCE(h.overall_unacceptable_count, 0::bigint))
        END AS accepted
   FROM genlexis.generated_sentences s
     LEFT JOIN genlexis.human_classification_summaries h ON h.sentence_id = s.id
     LEFT JOIN genlexis.latest_llm_classifications llm ON llm.sentence_id = s.id
     CROSS JOIN LATERAL ( SELECT llm.appropriate IS TRUE AND NOT (EXISTS ( SELECT 1
                   FROM genlexis.generated_sentence_classifications c
                  WHERE c.sentence_id = s.id AND c.judge_type = 'human'::text AND c.appropriate = false)) AS effective_appropriate,
            llm.grammatical IS TRUE OR COALESCE(h.vote_count, 0::bigint) >= 1 AND COALESCE(h.overall_acceptable_count, 0::bigint) >= COALESCE(h.overall_unacceptable_count, 0::bigint) AS effective_grammatical,
            COALESCE(( SELECT c.semantics
                   FROM genlexis.generated_sentence_classifications c
                  WHERE c.sentence_id = s.id AND c.judge_type = 'human'::text AND c.semantics IS NOT NULL
                  GROUP BY c.semantics
                  ORDER BY (count(*)) DESC, (c.semantics = llm.semantics) DESC
                 LIMIT 1), llm.semantics) AS effective_semantics) derived;

-- 6. La fenêtre de compatibilité.
CREATE VIEW aud.lexical_entries                    AS SELECT * FROM genlexis.lexical_entries;
CREATE VIEW aud.generated_sentences                AS SELECT * FROM genlexis.generated_sentences;
CREATE VIEW aud.generated_sentence_tokens          AS SELECT * FROM genlexis.generated_sentence_tokens;
CREATE VIEW aud.generated_sentence_classifications AS SELECT * FROM genlexis.generated_sentence_classifications;
CREATE VIEW aud.language_phoneme_distributions     AS SELECT * FROM genlexis.language_phoneme_distributions;
CREATE VIEW aud.latest_llm_classifications         AS SELECT * FROM genlexis.latest_llm_classifications;
CREATE VIEW aud.human_classification_summaries     AS SELECT * FROM genlexis.human_classification_summaries;
CREATE VIEW aud.sentence_acceptance                AS SELECT * FROM genlexis.sentence_acceptance;

COMMIT;

-- Hors transaction : la conversion de type a réécrit les tables et le planificateur
-- a perdu leurs statistiques ; sans ceci, les premières requêtes après la
-- migration prennent de mauvais plans.
ANALYZE genlexis.lexical_entries;
ANALYZE genlexis.generated_sentences;
ANALYZE genlexis.generated_sentence_tokens;
ANALYZE genlexis.generated_sentence_classifications;
ANALYZE genlexis.language_phoneme_distributions;
