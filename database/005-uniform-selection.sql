-- Sélection uniforme des tirages (révision `genlexis-fr-np-verb-r2`).
--
-- Un tirage uniforme n'est jugé contre aucune tolérance d'équilibre phonémique :
-- la colonne de tolérance devient nullable, et chaque tirage dit comment sa liste
-- a été choisie. Les tirages déjà stockés étaient tous équilibrés, ce que la valeur
-- par défaut enregistre pour eux.
--
-- Purement additif : le code déployé avant ce changement continue d'écrire une
-- tolérance et ignore la nouvelle colonne. À appliquer avant de déployer le code
-- qui sert `r2`, d'abord sur dev :
--
--   doppler run -p genlexis -c dev -- \
--     sh -c 'psql "$PRIVATE_DATABASE_URL" -v ON_ERROR_STOP=1 -f database/005-uniform-selection.sql'

BEGIN;

ALTER TABLE genlexis.material_draws
  ADD COLUMN IF NOT EXISTS selection text NOT NULL DEFAULT 'balanced';

ALTER TABLE genlexis.material_draws
  ADD CONSTRAINT material_draws_selection_check
  CHECK (selection IN ('balanced', 'uniform'));

ALTER TABLE genlexis.material_draws
  ALTER COLUMN phoneme_balance_tolerance DROP NOT NULL;

-- Une tolérance exactement quand la liste est équilibrée.
ALTER TABLE genlexis.material_draws
  ADD CONSTRAINT material_draws_tolerance_matches_selection
  CHECK ((selection = 'uniform') = (phoneme_balance_tolerance IS NULL));

COMMIT;
