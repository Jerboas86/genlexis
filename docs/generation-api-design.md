# API de génération lexicale — proposition de contrat

Statut : contrat implémenté dans l'application ; quotas non activés. Ce document rassemble les décisions prises pour une API destinée aux chercheurs et aux applications tierces. Le contrat de matériel utilisé par Helixum (`contracts/genlexis/v1/openapi.yaml`) reste distinct.

## Public et accès

- Les clients appellent l'API depuis des scripts ou des serveurs, jamais avec une clé embarquée dans un navigateur.
- Chaque chercheur ou application reçoit manuellement sa propre clé API. Une clé peut être révoquée sans affecter les autres clients.
- La clé est transmise dans `Authorization: Bearer <clé>`. La permission initiale est `generations:create`.
- Les secrets des clés sont affichés uniquement lors de leur création ; le service conserve un condensat permettant leur vérification. Les éventuelles tables appartiennent uniquement au schéma PostgreSQL `genlexis`.
- Les quotas et leur valeur restent à fixer après mesure des coûts des deux modes. Le contrat prévoit `429` et `Retry-After` si une limite est appliquée.

## Génération

`POST /v1/generations` accepte un document JSON. Tous les champs inconnus ou invalides sont refusés : contrairement au formulaire de l'application, l'API ne remplace pas silencieusement une valeur par un défaut ni ne réduit un nombre hors limites.

```json
{
	"selection": "phoneme_balanced",
	"language": "fr-FR",
	"pattern": "det_noun_adj",
	"listCount": 2,
	"itemsPerList": 10,
	"filters": {
		"detType": "definite",
		"gender": "f",
		"grammNumber": "s",
		"length": 2,
		"lengthUnit": "syllables",
		"lexicalDensity": "medium"
	},
	"seed": "etude-01",
	"allowPartial": false
}
```

| Champ          | Règle proposée                                                                                                                                                                                                 |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `selection`    | Obligatoire : `random` ou `phoneme_balanced`. Le premier utilise la génération aléatoire de l'application, le second son équilibrage phonémique.                                                               |
| `language`     | Obligatoire dans les deux modes ; seule `fr-FR` est acceptée au lancement.                                                                                                                                     |
| `pattern`      | Obligatoire : `noun`, `det_noun`, `det_noun_adj` ou `np_verb`.                                                                                                                                                 |
| `listCount`    | Entier de 1 à 5.                                                                                                                                                                                               |
| `itemsPerList` | Entier de 1 à 50. Ces limites reprennent celles de l'interface et doivent être confirmées par les mesures de charge de l'API.                                                                                  |
| `filters`      | Facultatif. Ses champs sont ceux déjà compris par le moteur ; `lengthUnit` n'a de sens qu'avec `length`, et `detType` seulement pour un patron avec déterminant. Une combinaison incohérente est refusée.      |
| `seed`         | Facultatif, chaîne non vide de 128 caractères au plus. Si absent, le serveur choisit une graine et la renvoie. La reproductibilité vaut seulement pour un état inchangé du corpus et des règles de génération. |
| `allowPartial` | Facultatif, `false` par défaut. Avec `true`, une liste incomplète peut être renvoyée ; une génération vide reste une erreur.                                                                                   |

La réponse contient `selection`, `language`, `seed`, les paramètres appliqués, `lists`, `requestedItems`, `totalItems` et `complete`. Chaque élément d'une liste contient au moins `sentenceId`, `sentence` et `pattern`. En mode `phoneme_balanced`, elle contient également les scores par liste, le score agrégé et la taille du pool effectivement considéré. Les scores mesurent la distance phonémique ; ils ne constituent pas un seuil d'acceptation pour cette API.

Si `totalItems < requestedItems` et que `allowPartial` vaut `false`, le service renvoie `422 insufficient_material` et aucune liste. Avec `allowPartial: true`, il renvoie `200`, `complete: false` et les éléments réellement produits. Si `totalItems` vaut zéro, il renvoie `422 insufficient_material` dans les deux cas.

Les réponses de génération portent `Cache-Control: no-store`. Le service ne conserve pas les résultats de cette API. Une graine ne garantit donc pas de retrouver le même résultat après modification du corpus ou des règles de génération.

## Erreurs

Réponse JSON stable, par exemple `{ "error": { "code": "invalid_request", "message": "..." } }`. Le message aide à corriger une requête ; les programmes s'appuient sur `code`.

| Statut | Cas                                                                           |
| ------ | ----------------------------------------------------------------------------- |
| `400`  | JSON ou paramètres invalides, champ inconnu, langue non prise en charge.      |
| `401`  | Clé absente, invalide ou révoquée.                                            |
| `403`  | Clé valide sans permission `generations:create`.                              |
| `422`  | Matériel insuffisant ou distribution phonémique indisponible pour la demande. |
| `429`  | Limite du client dépassée, si les quotas sont activés.                        |
| `503`  | Génération momentanément indisponible.                                        |

## Documentation dans l'application

La page `/api` est consultable sans clé et accessible depuis la navigation de Genlexis. Elle contient : démarrage rapide, authentification, description des paramètres, exemples `curl` pour les deux modes, réponses complètes et partielles, erreurs, limites, garantie de reproductibilité et procédure de demande d'accès. La spécification OpenAPI de cette API est téléchargeable depuis cette page et reste séparée du contrat Helixum.

Point de contact pour demander une clé ou obtenir de l'aide : [benoitdelemps@protonmail.com](mailto:benoitdelemps@protonmail.com).

## Stratégie de tests

La suite existante utilise Vitest pour le moteur et les handlers, et Playwright pour les parcours dans l'application. Les tests de l'API s'ajoutent à ces suites. Ils doivent vérifier le contrat observable et les risques de sécurité, sans répéter chaque test interne du moteur.

| Niveau                                                | Vérifications nécessaires                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Validation et orchestration, avec dépôt simulé        | Les deux valeurs de `selection`, chaque famille de filtre, refus des champs inconnus et des combinaisons incohérentes, bornes strictes, `fr-FR` obligatoire, graine fournie ou créée, `allowPartial` absent/`false`/`true`, et correspondance entre listes, compteurs et scores.                                                             |
| Handler HTTP, avec authentification et moteur simulés | `401` sans clé ou avec clé révoquée, `403` sans permission, succès dans les deux modes, `422` pour résultat insuffisant ou vide, `200` et `complete: false` si un résultat partiel est autorisé, `Cache-Control: no-store`, `429` et `Retry-After` lorsque les quotas seront activés. Les réponses et journaux ne contiennent jamais de clé. |
| Clés et administration, avec stockage de test         | Création, affichage unique du secret, vérification du condensat, attribution à un client, révocation et isolation entre deux clients. Les migrations et les requêtes ne touchent que le schéma `genlexis`.                                                                                                                                   |
| Contrat et documentation                              | Valider la spécification OpenAPI, comparer ses exemples aux réponses réelles, vérifier que chaque code d'erreur et chaque champ exposé y figure. Un test navigateur vérifie que `/api` est accessible sans clé, présent dans la navigation, lisible dans les langues de l'application et contient le contact et les exemples des deux modes. |
| Intégration sur la base de test                       | Avec un corpus de test contrôlé, appeler réellement les deux modes avec la même graine deux fois et comparer les listes, l'ordre et les scores ; vérifier les filtres, l'insuffisance du corpus et l'absence d'écriture métier. Isoler les données créées pour ne pas rendre la suite dépendante du corpus partagé.                          |

Avant ouverture aux premiers clients, mesurer le temps et la consommation de ressources des deux modes aux bornes autorisées, y compris une requête qui produit un résultat partiel. Ces mesures servent à confirmer les limites de taille et à choisir des quotas ; un test de performance chiffré ne devient une barrière CI qu'avec un environnement de mesure stable.

Le contrôle de livraison est `pnpm lint`, `pnpm check`, `pnpm test` et `pnpm build`, puis un essai sur l'environnement de test avec une clé créée et révoquée manuellement. Le pipeline actuel lance déjà lint, tests et build avant déploiement ; la vérification de types devra être ajoutée à cette barrière si elle n'y figure pas lors de l'implémentation. Aucun test de l'API ne doit dépendre d'une clé de production.

## Suivi opérationnel

1. Choisir la valeur des quotas par client après mesure de la charge, notamment pour `phoneme_balanced`.
2. Rejouer `database/006-generation-api-keys.sql` sur chaque environnement avant d'y émettre des clés ; le script `scripts/api-keys.mjs` assure leur création, leur liste et leur révocation.
3. Vérifier la reproductibilité sur le corpus de test dans les deux modes avant l'ouverture aux premiers clients.
