# OPGG Companion

Application Windows (Electron + React) pour League of Legends :

- **Connexion** : « Se connecter avec Riot » ouvre le Riot Client officiel ; une fois LoL lancé, le compte est détecté automatiquement (API locale du client, lecture seule, aucun mot de passe ne passe par l'app). Sans lancer le jeu, on peut consulter n'importe quel Riot ID.
- **Profil & historique** : rang, LP, champions de la saison, historique détaillé (KDA, CS/min, dégâts, vision, items, runes, détail des 10 joueurs). L'historique est conservé localement et s'enrichit à chaque synchronisation.
- **Stats** : radar hexagonal du profil de jeu (combat, farm, dégâts, vision, survie, économie) et tuiles comparées aux médianes de ton elo (ou d'un palier au choix, de Fer à Master+), winrate cumulé, stats par champion et par rôle.
- **Draft helper** : pendant la sélection des champions, propose des picks classés selon cinq critères activables et pondérables
  (méta, matchups et synergies : statistiques OP.GG des parties classées Émeraude+ du patch en cours) :
  winrate perso (lissé), mastery, méta du rôle, matchup contre l'adversaire de lane, synergie avec les alliés.
  Un modèle optionnel (régression logistique) apprend les poids à partir de ton historique.
  En classée solo, seul l'historique solo compte ; en flex, solo + flex.
- **Build au lock** : trois sources — statistiques OP.GG du matchup, build général, et builds réels des meilleurs
  joueurs du champion regroupés en variantes cohérentes (runes + sorts + items joués ensemble). Import en un clic
  de la page de runes, des sorts (Flash garde ta touche) et d'un set d'items ; import automatique au lock en option.
- **En jeu** : overlay (mode sans bordure) ou fenêtre sur un second écran. CS et repères 10/15/20 min comparés à
  la médiane de ton elo, score de vision, écart d'or par lane en maintenant Tab, build à la demande.

Données : [OP.GG MCP](https://github.com/opgginc/opgg-mcp) (`https://mcp-api.op.gg/mcp`), client LoL local (LCU),
API de jeu locale (Live Client Data), Riot Data Dragon.

Les médianes par elo (`src/main/data/benchmarks.json`) sont calculées par `npm run bench:build` sur des games classées
solo récentes d'OP.GG, classées selon l'elo moyen de la partie. Le score de vision n'étant pas exposé par OP.GG, ses
repères sont estimés (ordres de grandeur publics par rang, répartis par rôle selon la part de wards mesurée).

## Développement

```bash
npm install
npm run dev          # lance l'app
npm test             # tests unitaires
npm run mock:lcu     # faux client LoL (voir plus bas)
npm run build:win    # installeur + portable Windows dans dist/
```

### Tester sans Windows ni client LoL

`npm run mock:lcu` démarre un faux client LoL (HTTP + WebSocket) qui simule un compte et une sélection des champions
(`MOCK_LOOP=1` pour la rejouer en boucle). Lancer ensuite l'app avec la variable `LCU_LOCKFILE` affichée par le script.

`OPGG_CAPTURE_DIR=<dossier>` fait parcourir toutes les pages à l'app, en enregistre une capture PNG puis la ferme.

`npm run smoke:opgg` vérifie le client OP.GG et le draft helper contre l'API réelle.

### Windows

`npm run build:win` produit `dist/OPGG Companion-Setup-<version>.exe` (installeur) et `…-Portable-<version>.exe`.
La CI GitHub construit aussi ces fichiers sur `windows-latest`, et les publie en release pour chaque tag `v*`.
Les exécutables ne sont pas signés : Windows SmartScreen affiche un avertissement au premier lancement.

## Architecture

| Dossier | Rôle |
|---|---|
| `src/main/lcu` | découverte du client (process / lockfile), REST + WebSocket, conversion de la champ select |
| `src/main/opgg` | client MCP OP.GG et parser de son format de réponse compact |
| `src/main/draft` | score des candidats (`score.ts`), collecte des données (`engine.ts`), modèle ML (`train.ts`) |
| `src/main/app.ts` | service exposé au renderer via IPC |
| `src/renderer` | interface React |
