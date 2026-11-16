# Du prototype à Voyage RDC public

## Semaine 1 — données et périmètre

Les CSV d'origine sont désormais inclus et leur import a été testé : 26 provinces, 49 lieux, 100 points, 145 liaisons, 8 opérateurs. Contrôler les incohérences et choisir un corridor pilote. Les résultats restent masqués jusqu'à validation réelle.

## Semaines 2–3 — exploitation

Créer un processus de vérification : source nominative, date, prix, horaires, état de l'axe, contact opérateur et date de révision. Ajouter aux liaisons les fenêtres de validité, une date d'expiration et des règles de masquage automatique. Mettre une équipe responsable des signalements et corrections.

## Semaines 4–5 — durcissement technique

Migrations SQL versionnées ; comptes nominatifs pour les administrateurs et journal d'audit ; protections HTTP/anti-abus ; intégration de métriques, alertes, tests de charge et sauvegardes/restaurations automatisées. Ajouter un domaine HTTPS, politique de données et support utilisateurs. Adapter la cartographie aux conditions d'utilisation du fournisseur de tuiles.

## Semaine 6 — pilote sur terrain

Tester sur des téléphones Android modestes et réseaux mobiles lents, mesurer temps de réponse, erreurs, chemins impossibles, exactitude prix et points d'embarquement. Valider avec transporteurs réels avant ouverture à de nouveaux voyageurs.

## Phase 2 — modèle commercial (à développer ultérieurement)

Le modèle de base actuel sépare `liaisons` (possibilités géographiques) des futurs `services` (offres des opérateurs) et `departs` (voyages datés). Ajouter `inventaires`, `reservations`, `transactions`, `billets`, `remboursements`. Exiger transactions atomiques sur la disponibilité, contrôles d'idempotence des paiements, rapprochement financier, notifications et contrôle d'accès par rôle. Les paiements doivent passer par un prestataire autorisé et une architecture auditée ; ne pas ajouter de bouton « payer » tant qu'aucun contrat transporteur ni procédure de remboursement n'existe.

## Décisions conservées

- Version 1 gratuite.
- Fonctionnement en ligne uniquement ; pas de service worker, pas de base locale pour les voyageurs.
- Les prix sont des indications et les horaires ne sont pas en temps réel.
- Les réservations et paiements sont explicitement exclus de la V1.
