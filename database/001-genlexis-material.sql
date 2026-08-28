-- Lot 3 — les tables du service de tirage.
--
-- Écrit à la main plutôt que produit par `drizzle-kit push`, et strictement
-- additif : `push` compare le schéma déclaré à la base et propose de supprimer
-- ce qu'il n'y voit pas, or Helixum et Genlexis partagent cette base en n'en
-- déclarant chacun qu'une partie. Voir `specs/shared-database-ownership.md`
-- dans le dépôt Helixum.
--
-- Rien ici ne modifie ni ne supprime quoi que ce soit d'existant. Le retour
-- arrière est en bas du fichier.
--
-- Application, un environnement à la fois :
--   doppler run -p genlexis -c dev -- \
--     psql "$PRIVATE_DATABASE_URL" -v ON_ERROR_STOP=1 -f database/001-genlexis-material.sql

BEGIN;

-- Le schéma que ce dépôt possède seul. `aud` reste partagé avec Helixum ; tout
-- ce qui est propre à Genlexis vient ici, pour qu'un jour `push` puisse être sûr
-- par construction plutôt que par discipline.
CREATE SCHEMA IF NOT EXISTS genlexis;

-- Un tirage servi à un consommateur.
--
-- Jamais mis à jour : une correction publie un nouveau tirage, et l'ancien
-- continue de nommer exactement ce qu'il a servi.
CREATE TABLE IF NOT EXISTS genlexis.material_draws (
    draw_id                    text        PRIMARY KEY,
    protocol_revision          text        NOT NULL,
    material_source_id         text        NOT NULL,
    material_release           text        NOT NULL,
    -- Le pool contre lequel le tirage a été fait. Une graine seule ne rejoue
    -- rien : la même graine sur un pool modifié donne d'autres phrases.
    pool_revision              text        NOT NULL,
    language                   aud.lang_code NOT NULL,
    seed                       text        NOT NULL,
    options                    text        NOT NULL,
    phoneme_balance_distance   numeric     NOT NULL,
    -- La tolérance à laquelle CE tirage a été jugé. Relue ici et non dans le
    -- registre : une révision republiée avec une autre valeur ne doit pas
    -- changer rétroactivement ce qu'un tirage servi prétend avoir respecté.
    phoneme_balance_tolerance  numeric     NOT NULL,
    issued_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS material_draws_protocol_idx
    ON genlexis.material_draws (protocol_revision, issued_at);

-- Les items exacts d'un tirage.
--
-- C'est ce qui rend un `drawId` résoluble. Un consommateur qui tourne ses
-- séances n'envoie que des identifiants ; le service est l'autorité normative
-- sur ce qu'ils contenaient, parce qu'un client ayant perdu son historique
-- local affaiblirait sinon la rotation en silence.
CREATE TABLE IF NOT EXISTS genlexis.material_draw_items (
    draw_id       text   NOT NULL REFERENCES genlexis.material_draws (draw_id) ON DELETE CASCADE,
    position      integer NOT NULL,
    item_id       text   NOT NULL,
    -- Dérivée du texte, donc une correction est une nouvelle révision par
    -- construction plutôt que parce que quelqu'un a pensé à incrémenter.
    item_revision text   NOT NULL,
    -- Le texte tel qu'il a été servi. Le relire depuis `generated_sentences`
    -- ferait renvoyer, après correction d'une phrase, le nouveau texte sous
    -- l'ancienne révision — deux champs qui se contredisent.
    text          text   NOT NULL,
    sentence_id   bigint NOT NULL,
    PRIMARY KEY (draw_id, position)
);

-- L'index sur lequel tourne la requête d'exclusion : la rotation résout les
-- tirages exclus vers ces paires.
CREATE INDEX IF NOT EXISTS material_draw_items_identity_idx
    ON genlexis.material_draw_items (item_id, item_revision);
CREATE INDEX IF NOT EXISTS material_draw_items_draw_idx
    ON genlexis.material_draw_items (draw_id);

-- Le registre d'idempotence.
--
-- L'empreinte est la forme canonique de la requête — version de contrat,
-- révision de protocole, exclusions triées et dédupliquées. La même clé avec la
-- même empreinte rejoue ; avec une autre, c'est un conflit et non un second
-- tirage.
--
-- La clé est un condensé HMAC dérivé par le consommateur d'un identifiant de
-- préparation. Ce n'est jamais un identifiant de compte ni de session, et rien
-- ici ne la relie à une personne.
CREATE TABLE IF NOT EXISTS genlexis.material_idempotency (
    idempotency_key text        PRIMARY KEY,
    fingerprint     text        NOT NULL,
    draw_id         text        NOT NULL REFERENCES genlexis.material_draws (draw_id) ON DELETE CASCADE,
    created_at      timestamptz NOT NULL DEFAULT now(),
    -- Couvre les fenêtres de reprise, de rotation et de transfert, puis lapse.
    expires_at      timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS material_idempotency_expiry_idx
    ON genlexis.material_idempotency (expires_at);

COMMIT;

-- Retour arrière, si nécessaire. Il ne touche que ce que ce fichier a créé.
--
-- BEGIN;
--   DROP TABLE IF EXISTS genlexis.material_idempotency;
--   DROP TABLE IF EXISTS genlexis.material_draw_items;
--   DROP TABLE IF EXISTS genlexis.material_draws;
--   DROP SCHEMA IF EXISTS genlexis RESTRICT;  -- RESTRICT : refuse si autre chose y vit
-- COMMIT;
