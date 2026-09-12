-- Lot C, fin de la fenêtre de compatibilité.
--
-- À appliquer seulement quand plus aucun code déployé ne lit `aud.<corpus>` —
-- c'est-à-dire après que Genlexis a été redéployé depuis un commit où
-- `repository.ts` et `schema.ts` nomment `genlexis.*`. Avant cela, ce fichier
-- casse le service en ligne.
--
--   doppler run -p genlexis -c dev -- \
--     psql "$PRIVATE_DATABASE_URL" -v ON_ERROR_STOP=1 -f database/004-drop-corpus-compat.sql

BEGIN;

DROP VIEW IF EXISTS aud.sentence_acceptance;
DROP VIEW IF EXISTS aud.human_classification_summaries;
DROP VIEW IF EXISTS aud.latest_llm_classifications;
DROP VIEW IF EXISTS aud.language_phoneme_distributions;
DROP VIEW IF EXISTS aud.generated_sentence_classifications;
DROP VIEW IF EXISTS aud.generated_sentence_tokens;
DROP VIEW IF EXISTS aud.generated_sentences;
DROP VIEW IF EXISTS aud.lexical_entries;

COMMIT;
