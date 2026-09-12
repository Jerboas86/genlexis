-- Lot B — la colonne `language` de `material_draws` cesse de dépendre de `aud`.
--
-- `001-genlexis-material.sql` l'avait typée `aud.lang_code`, par symétrie avec
-- `generated_sentences.language`. C'est une dépendance d'un schéma que Genlexis
-- possède vers un type d'un schéma qu'il partage — exactement ce que la cible
-- de `shared-database-ownership.md` interdit — et drizzle-kit, borné à `genlexis`
-- par `schemaFilter`, ne peut pas la représenter : il propose soit un ALTER vers
-- un type `"undefined"."aud.lang_code"` qui échouerait, soit de recréer un enum
-- qui existe déjà. Un `push` qui dit « no changes » n'est possible qu'en coupant
-- la dépendance.
--
-- `text` suffit : la valeur vient du registre des révisions (`'fr-FR'`), qui est
-- l'autorité, et non d'une contrainte de type. Aucune donnée ne change.
--
-- Application, un environnement à la fois :
--   doppler run -p genlexis -c dev -- \
--     psql "$PRIVATE_DATABASE_URL" -v ON_ERROR_STOP=1 -f database/002-material-draws-language-text.sql

BEGIN;

ALTER TABLE genlexis.material_draws
    ALTER COLUMN language TYPE text USING language::text;

COMMIT;

-- Retour arrière : seules des valeurs de l'enum ont jamais été écrites.
--
-- BEGIN;
--   ALTER TABLE genlexis.material_draws
--       ALTER COLUMN language TYPE aud.lang_code USING language::aud.lang_code;
-- COMMIT;
