# Voyage RDC V1.1 — application en ligne

Une première version technique de **Voyage RDC** : consultation gratuite d'itinéraires multimodaux en RDC, à partir de données validées et centralisées. **Internet obligatoire.** Aucun service worker ni stockage local de trajets, aucun module de réservation ou paiement.

> **Statut : prototype fonctionnel à tester avant tout lancement public.** Cette version comprend les **145 liaisons réelles de l'archive fournie**, dans `backend/seed/donnees/*.csv`. Ces données sont des estimations et des informations de départ, pas des horaires/tarifs garantis. Elles doivent être vérifiées sur le terrain, puis publiées sélectivement.

## Architecture

- `frontend/` : React + Vite, interface responsive, recherche et administration.
- `backend/app/` : API FastAPI, moteur de recherche à correspondances, vérification d'accès admin.
- `backend/scripts/` : initialisation SQL et import de `voyage-rdc.zip` ou de ses CSV.
- `backend/seed/donnees/` : CSV originaux fournis (26 provinces, 49 lieux, 100 points, 8 opérateurs, 145 liaisons).
- `backend/tests/` : tests API, visibilité et validation des sources.
- `docker-compose.yml` : PostgreSQL + API + application Web derrière Nginx.
- `Dockerfile.render` et `render.yaml` : mise en ligne du front et de l'API sous une seule URL Render avec base PostgreSQL managée.

## Déploiement sur Render (pilote en ligne)

Le dépôt GitHub contient un Blueprint `render.yaml`. Il prévoit un site Web
unique (frontend React et API FastAPI) et une base PostgreSQL en région
Frankfurt. Un secret d'administration est généré par Render. Aucun secret ne
doit être enregistré dans le code source.

1. Pousser tous les fichiers du projet à la racine du dépôt GitHub.
2. Dans le tableau de bord Render, créer un **Blueprint** depuis ce dépôt.
3. Vérifier les deux ressources et leurs coûts avant de confirmer l'application du Blueprint.
4. Attendre que le déploiement soit terminé et que `/api/health` réponde `{"status":"ok"}`.
5. Tester la recherche des villes. Les liaisons resteront invisibles jusqu'à leur validation et leur publication.
6. Récupérer le jeton `ADMIN_API_TOKEN` dans la configuration privée Render afin d'accéder à `/admin` (ne pas l'envoyer dans une discussion ni le publier).

Les plans `free` configurés dans le Blueprint conviennent uniquement à un **pilote temporaire** : leur disponibilité, leurs limites et la durée de vie de la base gratuite dépendent de Render. Avant toute ouverture publique durable, sélectionner des plans appropriés, activer les sauvegardes, tester leur restauration, assurer la supervision et valider les itinéraires sur le terrain.

> Attention : si ce code remplace un ancien dépôt public qui contenait un fichier `.env`, la suppression du fichier dans la nouvelle branche ne révoque pas les identifiants exposés dans l'historique Git. Renouveler ces identifiants immédiatement et traiter l'historique selon les procédures de sécurité GitHub.

Chaque liaison est importée avec `publie=0`. Il faut **statut OK**, **date de vérification** et **source_info** pour publier. Le moteur n'affiche que les liaisons publiées et OK. Le moteur calcule un chemin par critère (rapide, économique, court) sans inventer de trajets inverses. Les résultats restent **indicatifs**, pas une promesse de place disponible.

## Démarrer avec Docker (recommandé)

1. Copiez `.env.example` en `.env`.
2. Remplacez `POSTGRES_PASSWORD` et `ADMIN_API_TOKEN` par des valeurs fortes, uniques, sans accents ni caractères spéciaux dans le mot de passe d'URL (ou adaptez l'encodage de `DATABASE_URL`). Exemple pour le jeton : `python -c "import secrets; print(secrets.token_urlsafe(48))"`.
3. Lancez `docker compose up --build -d`.
4. Ouvrez [http://localhost:8080](http://localhost:8080). L'API répond sous `/api/health`. Les données CSV incluses sont **importées automatiquement** au premier démarrage ; les redémarrages ne créent pas de doublons pour des lignes inchangées.
5. Connectez-vous dans `/admin` avec `ADMIN_API_TOKEN`, vérifiez chaque liaison avec une source et une date, puis cochez « Publier ».

Le site est **en ligne seulement** : une connexion est requise pour rechercher les itinéraires. Les pages statiques sont chargées normalement depuis le serveur ; aucune recherche n'est disponible sans API.

### Développement sans Docker

Dans un terminal :

```bash
cd backend
python -m venv .venv
. .venv/bin/activate
pip install -r requirements-dev.txt
python -m scripts.init_db
python -m scripts.import_csv --directory seed
ADMIN_API_TOKEN="un-jeton-long-et-aleatoire" uvicorn app.main:app --reload --port 8000
```

Dans un deuxième terminal :

```bash
cd frontend
npm install
npm run dev
```

Puis ouvrez [http://localhost:5173](http://localhost:5173). Pour le développement local seul, la base SQLite est utilisée par défaut (`backend/voyage_rdc.db`), **PostgreSQL est obligatoire pour le déploiement réel**.

### Importer un dossier déjà extrait

```bash
cd backend
python -m scripts.import_csv --directory /chemin/vers/voyage-rdc
```

L'import de la même archive est idempotent. **Attention** : si vous modifiez un champ d'une liaison dans le CSV et réimportez, une nouvelle ligne peut être ajoutée car l'empreinte de source change. Après l'import initial, gérez les corrections par l'administration, ou définissez une stratégie de réconciliation avant des imports récurrents.

**Données et publication :** les 145 liaisons sont visibles dans `/admin` après le démarrage. Les 74 lignes marquées `ok` par l'ancien projet **ne sont pas automatiquement certifiées ni publiées**. Tant qu'aucune liaison n'a été validée sur le terrain et publiée, la recherche publique affiche « Aucun itinéraire publié actuellement » : c'est une mesure de sécurité volontaire.

## API disponible

| URL | Usage |
|---|---|
| `GET /api/health` | Santé et connexion DB |
| `GET /api/lieux?recherche=kin` | Villes répertoriées |
| `GET /api/points?lieu_id=...` | Points d'embarquement, avec indicateur initial de vérification |
| `GET /api/operateurs` | Transporteurs référencés |
| `GET /api/itineraire?depart_id=...&arrivee_id=...&modes=bus,avion` | Jusqu'à trois itinéraires de référence |
| `GET /api/admin/statistiques` | Compteurs (jeton admin) |
| `GET /api/admin/liaisons?limit=50&offset=0` | Gestion des liaisons (jeton admin) |
| `PATCH /api/admin/liaisons/{id}` | Corriger / publier (jeton admin) |

Dans les appels administrateur, envoyer `Authorization: Bearer <ADMIN_API_TOKEN>`. Documentation interactive du backend : `/docs` en développement.

## Tests

```bash
cd backend
python -m unittest discover -s tests -v
```

## Limites à lever avant le public

- Vérifier les horaires, tarifs, sécurité des axes et emplacements sur le terrain (les anciens statuts `ok` ne constituent pas une preuve).
- Ajouter un historique d'audit des actions d'administration, une gestion de comptes et rôles, une protection réseau avec limitation de requêtes et une supervision applicative.
- Mettre en place des migrations versionnées, des sauvegardes PostgreSQL hors serveur, une restauration testée, HTTPS et des procédures d'incident.
- Établir les responsabilités de mise à jour des opérateurs et une politique d'expiration des validations.
- Ne pas traiter de réservation, paiement ou données sensibles des voyageurs avant la phase commerciale.

Voir [docs/ETAPES_SUIVANTES.md](docs/ETAPES_SUIVANTES.md).
