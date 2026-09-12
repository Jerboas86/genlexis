-- Seed de développement — les jugements LLM des phrases `np_verb` déjà présentes.
--
-- **Développement seulement.** Rien ici ne doit être appliqué à la production :
-- ces lignes y existent déjà, ce fichier en est l'export.
--
-- Pourquoi ce fichier existe. La base de dev portait bien les 144 phrases
-- `np_verb` de la production, avec leurs tokens `det`/`noun`/`verb`
-- correctement liés au lexique — mais une seule classification. Or
-- `genlexis.sentence_acceptance` n'accepte une phrase de ce motif que si un juge LLM
-- l'a déclarée appropriée, grammaticale et de sémantique `natural` ou
-- `plausible`. Sans ces lignes, dev n'offrait que 2 phrases tirables à densité
-- moyenne quand la révision `genlexis-fr-np-verb-r1` en tire 20 : le service
-- refusait, à juste titre, avec `incomplete_draw`.
--
-- Ce sont les jugements réels de la production, copiés tels quels — modèle,
-- empreinte de prompt et horodatage compris — et non des valeurs fabriquées.
-- L'appariement se fait par le texte de la phrase, les identifiants des deux
-- environnements n'ayant aucun rapport entre eux.
--
-- Rejouable : une phrase qui a déjà une classification `llm` est ignorée.
--
--   doppler run -p genlexis -c dev -- \
--     psql "$PRIVATE_DATABASE_URL" -v ON_ERROR_STOP=1 -f database/seeds/dev-np-verb-classifications.sql

BEGIN;

-- Le pooler Neon réutilise les backends, si bien qu'une table temporaire peut
-- survivre à la session qui l'a créée. `ON COMMIT DROP` ne couvre pas une
-- exécution précédente interrompue.
DROP TABLE IF EXISTS incoming;

CREATE TEMP TABLE incoming (
    sentence               text,
    appropriate            boolean,
    grammatical            boolean,
    semantics              text,
    classifier_model       text,
    classifier_prompt_hash text,
    classified_at          timestamptz
) ON COMMIT DROP;

INSERT INTO incoming VALUES
	('Des antécédents manquent.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:23:36.715691+00'::timestamptz),
	('Des autorités correspondent.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 15:01:05.113383+00'::timestamptz),
	('Des camarades chantent.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 15:01:02.779845+00'::timestamptz),
	('Des camarades partent.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:17:20.944009+00'::timestamptz),
	('Des docteurs parlent.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:36:55.457591+00'::timestamptz),
	('Des docteurs tournent.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:39:33.732973+00'::timestamptz),
	('Des détectives continuent.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:28:40.485036+00'::timestamptz),
	('Des espoirs manquent.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:26:40.298986+00'::timestamptz),
	('Des fantômes tiennent.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:37:28.879537+00'::timestamptz),
	('Des générations suivent.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:44:51.996791+00'::timestamptz),
	('Des musiciens courent.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:31:47.755141+00'::timestamptz),
	('Des poubelles tournent.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:32:57.064627+00'::timestamptz),
	('Des supérieurs arrêtent.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 15:05:54.256604+00'::timestamptz),
	('Des tatouages correspondent.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:24:32.011094+00'::timestamptz),
	('L''américain rêve.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:38:50.227802+00'::timestamptz),
	('L''autorité presse.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:13:07.089503+00'::timestamptz),
	('L''empereur danse.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:36:39.48356+00'::timestamptz),
	('L''humiliation dure.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:22:04.553486+00'::timestamptz),
	('L''imagination coule.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:30:04.779049+00'::timestamptz),
	('L''impatience colle.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:59:00.38394+00'::timestamptz),
	('L''innocence casse.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:35:01.422925+00'::timestamptz),
	('L''intervention tourne.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:27:45.921368+00'::timestamptz),
	('L''étudiante travaille.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:59:58.387434+00'::timestamptz),
	('L''évidence traîne.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:22:24.70392+00'::timestamptz),
	('L''événement échoue.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:38:27.864254+00'::timestamptz),
	('La blessure recommence.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:46:58.567868+00'::timestamptz),
	('La catégorie recommence.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:56:54.554154+00'::timestamptz),
	('La certitude échoue.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:34:19.639894+00'::timestamptz),
	('La confusion colle.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:22:50.26588+00'::timestamptz),
	('La connaissance recommence.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:30:33.287887+00'::timestamptz),
	('La coopération tombe.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:26:45.707742+00'::timestamptz),
	('La créature pointe.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:58:41.954059+00'::timestamptz),
	('La discipline brille.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:25:57.292476+00'::timestamptz),
	('La disposition presse.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:28:44.416146+00'::timestamptz),
	('La gentillesse réduit.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:18:59.493973+00'::timestamptz),
	('La gratitude provient.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:55:13.297307+00'::timestamptz),
	('La génération accroche.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 15:01:17.523279+00'::timestamptz),
	('La liaison pardonne.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:40:27.066076+00'::timestamptz),
	('La majesté fait.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:15:30.832319+00'::timestamptz),
	('La priorité tient.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:54:57.322961+00'::timestamptz),
	('La précision change.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:37:51.736769+00'::timestamptz),
	('La rancune étouffe.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 15:05:13.706218+00'::timestamptz),
	('La sagesse marque.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:49:41.26768+00'::timestamptz),
	('La société promet.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:26:34.649918+00'::timestamptz),
	('La société prête.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:16:52.427976+00'::timestamptz),
	('La séparation brûle.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:15:53.935802+00'::timestamptz),
	('La vedette coule.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:22:30.847567+00'::timestamptz),
	('La volonté revient.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:52:44.617137+00'::timestamptz),
	('La volonté tremble.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:35:54.751529+00'::timestamptz),
	('Le cadavre jure.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 15:01:13.469424+00'::timestamptz),
	('Le candidat attache.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:21:15.643009+00'::timestamptz),
	('Le chevalier sort.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:33:36.385471+00'::timestamptz),
	('Le colonel pardonne.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:29:32.585432+00'::timestamptz),
	('Le colonel parle.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 15:01:31.286682+00'::timestamptz),
	('Le docteur rate.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:36:31.1242+00'::timestamptz),
	('Le fantôme accélère.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:27:17.414138+00'::timestamptz),
	('Le lieutenant allume.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:37:07.990871+00'::timestamptz),
	('Le manager pleure.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:53:00.335829+00'::timestamptz),
	('Le monseigneur file.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:43:14.42813+00'::timestamptz),
	('Le médium pleut.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 15:05:30.4166+00'::timestamptz),
	('Le parapluie penche.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:17:47.48323+00'::timestamptz),
	('Le satellite baisse.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:51:22.766113+00'::timestamptz),
	('Le satellite traîne.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:37:59.846767+00'::timestamptz),
	('Le serviteur déménage.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:50:35.581585+00'::timestamptz),
	('Le serviteur saigne.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:33:54.943377+00'::timestamptz),
	('Le sniper crie.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:53:25.650777+00'::timestamptz),
	('Le supérieur joue.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:34:25.78471+00'::timestamptz),
	('Le thérapeute pardonne.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:52:11.920057+00'::timestamptz),
	('Le voisin profite.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:57:44.693053+00'::timestamptz),
	('Les américains marchent.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 15:04:55.76724+00'::timestamptz),
	('Les bénéfices disparaissent.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:20:55.985439+00'::timestamptz),
	('Les camarades jouent.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:30:07.729667+00'::timestamptz),
	('Les cauchemars meurent.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:14:41.189546+00'::timestamptz),
	('Les cauchemars reviennent.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:39:19.720278+00'::timestamptz),
	('Les cauchemars tiennent.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:13:59.902891+00'::timestamptz),
	('Les compagnons courent.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:17:38.140774+00'::timestamptz),
	('Les compagnons partent.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 15:04:29.714002+00'::timestamptz),
	('Les connaissances changent.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:34:10.548042+00'::timestamptz),
	('Les couvertures battent.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:27:33.877759+00'::timestamptz),
	('Les couvertures fonctionnent.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:35:25.015844+00'::timestamptz),
	('Les créatures dorment.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:33:00.259801+00'::timestamptz),
	('Les entreprises travaillent.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:18:34.421994+00'::timestamptz),
	('Les espoirs changent.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:32:41.578068+00'::timestamptz),
	('Les funérailles passent.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:20:58.932278+00'::timestamptz),
	('Les générations continuent.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:45:32.059463+00'::timestamptz),
	('Les individus chantent.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:45:20.508659+00'::timestamptz),
	('Les instruments fonctionnent.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:31:09.908033+00'::timestamptz),
	('Les lumières disparaissent.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:18:07.635257+00'::timestamptz),
	('Les magazines tirent.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:36:45.136712+00'::timestamptz),
	('Les musiciens correspondent.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:59:45.115799+00'::timestamptz),
	('Les médecins chantent.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:46:02.290562+00'::timestamptz),
	('Les obligations passent.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:29:28.407725+00'::timestamptz),
	('Les occasions manquent.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:15:50.249864+00'::timestamptz),
	('Les personnages changent.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:59:34.795182+00'::timestamptz),
	('Les possibilités continuent.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:23:48.266818+00'::timestamptz),
	('Les prisonniers dorment.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 15:03:06.642877+00'::timestamptz),
	('Les prisonniers parlent.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:33:33.92765+00'::timestamptz),
	('Les producteurs dorment.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:28:04.601702+00'::timestamptz),
	('Les professeurs courent.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:54:51.916668+00'::timestamptz),
	('Les sociétés travaillent.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:51:47.343858+00'::timestamptz),
	('Les souvenirs meurent.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:53:04.759134+00'::timestamptz),
	('Les supérieurs sortent.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:53:38.925303+00'::timestamptz),
	('Les uniformes disparaissent.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:51:19.817835+00'::timestamptz),
	('Les économies disparaissent.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:58:23.027965+00'::timestamptz),
	('Un adjoint rêve.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:53:22.456223+00'::timestamptz),
	('Un cadavre rigole.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:19:48.396225+00'::timestamptz),
	('Un chevalier brûle.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:56:03.680796+00'::timestamptz),
	('Un citoyen traîne.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:44:14.149672+00'::timestamptz),
	('Un compagnon rigole.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:32:29.049381+00'::timestamptz),
	('Un cuisinier cuit.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:41:48.408134+00'::timestamptz),
	('Un cuisinier rate.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:48:27.290513+00'::timestamptz),
	('Un détective court.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:29:54.95+00'::timestamptz),
	('Un imposteur tremble.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:33:05.665811+00'::timestamptz),
	('Un individu brille.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:57:11.509414+00'::timestamptz),
	('Un inspecteur récupère.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:39:26.849976+00'::timestamptz),
	('Un inspecteur veille.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:48:35.891822+00'::timestamptz),
	('Un lieutenant balance.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:47:17.246759+00'::timestamptz),
	('Un magicien dîne.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:40:56.431674+00'::timestamptz),
	('Un monseigneur accélère.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:29:45.119416+00'::timestamptz),
	('Un monseigneur rigole.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:56:57.501112+00'::timestamptz),
	('Un médecin balance.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:32:44.035541+00'::timestamptz),
	('Un médecin hurle.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:54:08.661416+00'::timestamptz),
	('Un original brûle.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:31:22.689507+00'::timestamptz),
	('Un personnel hurle.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 15:00:03.792904+00'::timestamptz),
	('Un puzzle brille.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 15:03:23.848259+00'::timestamptz),
	('Un réalisateur vire.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:40:36.894299+00'::timestamptz),
	('Un satellite souffle.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:18:31.717151+00'::timestamptz),
	('Un supporter promet.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:41:23.341793+00'::timestamptz),
	('Une ambition augmente.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:31:06.711416+00'::timestamptz),
	('Une communauté reprend.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:59:53.233539+00'::timestamptz),
	('Une concurrence cesse.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:58:09.758669+00'::timestamptz),
	('Une couverture traîne.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:15:06.751877+00'::timestamptz),
	('Une entreprise profite.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:17:45.023435+00'::timestamptz),
	('Une identification éclate.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:41:16.219567+00'::timestamptz),
	('Une marchandise explose.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:49:50.972238+00'::timestamptz),
	('Une poubelle lâche.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:46:54.39089+00'::timestamptz),
	('Une poursuite passe.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:19:43.974968+00'::timestamptz),
	('Une priorité brille.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:19:28.490771+00'::timestamptz),
	('Une priorité traîne.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:44:04.3215+00'::timestamptz),
	('Une présidente vole.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:28:33.115188+00'::timestamptz),
	('Une religion débarque.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:33:08.859798+00'::timestamptz),
	('Une sagesse revient.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:56:29.975051+00'::timestamptz),
	('Une sorcière colle.', true, true, 'plausible', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:52:53.947013+00'::timestamptz),
	('Une vedette rigole.', true, true, 'natural', 'gpt-5.4-mini', 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753', '2026-05-22 14:23:11.153852+00'::timestamptz);

INSERT INTO genlexis.generated_sentence_classifications
    (sentence_id, judge_type, appropriate, grammatical, semantics,
     classifier_model, classifier_prompt_hash, classified_at)
SELECT DISTINCT ON (g.id)
    g.id, 'llm', i.appropriate, i.grammatical, i.semantics,
    i.classifier_model, i.classifier_prompt_hash, i.classified_at
FROM incoming i
JOIN genlexis.generated_sentences g
    ON g.sentence = i.sentence
   AND g.language = 'fr-FR'
   AND g.pattern  = 'np_verb'
WHERE NOT EXISTS (
    SELECT 1 FROM genlexis.generated_sentence_classifications c
    WHERE c.sentence_id = g.id AND c.judge_type = 'llm'
)
ORDER BY g.id;

COMMIT;

-- Retour arrière : ne retire que les lignes que ce fichier a pu poser.
--
-- BEGIN;
--   DELETE FROM genlexis.generated_sentence_classifications c
--   USING genlexis.generated_sentences g
--   WHERE c.sentence_id = g.id AND c.judge_type = 'llm'
--     AND g.pattern = 'np_verb' AND g.language = 'fr-FR'
--     AND c.classifier_prompt_hash = 'ceea00581e31b78478bac7e93d9f6e06da74c0464f6e10a56a95936463f75753';
-- COMMIT;
