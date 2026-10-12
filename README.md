# OPGG Companion

Application Windows (Electron + React) pour League of Legends :

- **Détection du compte** : quand le client LoL est lancé, le compte connecté est détecté automatiquement (API locale du client, lecture seule). Sans client, on peut saisir son Riot ID.
- **Profil & historique** : rang, LP, champions de la saison, historique détaillé (KDA, CS/min, dégâts, vision, items, runes, détail des 10 joueurs). L'historique est conservé localement et s'enrichit à chaque synchronisation.
- **Stats** : winrate cumulé, stats par champion et par rôle.
- **Draft helper** : pendant la sélection des champions, propose des picks classés selon cinq critères activables et pondérables :
  winrate perso (lissé), mastery, méta du rôle, matchup contre l'adversaire de lane, synergie avec les alliés.
  Un modèle optionnel (régression logistique) apprend les poids à partir de ton historique.

Données : [OP.GG MCP](https://github.com/opgginc/opgg-mcp) (`https://mcp-api.op.gg/mcp`), client LoL local (LCU), Riot Data Dragon.

## Développement

```bash
npm install
npm run dev          # lance l'app
npm test             # tests unitaires
npm run mock:lcu     # faux client LoL (voir plus bas)
npm run build:win    # installeur + portable Windows dans dist/
```

### Tester sans Windows ni client LoL

`npm run mock:lcu` démarre un faux client LoL (HTTPS + WebSocket) qui simule un compte et une sélection des champions.
Lancer ensuite l'app avec la variable `LCU_LOCKFILE` affichée par le script.

## Architecture

| Dossier | Rôle |
|---|---|
| `src/main/lcu` | découverte du client (process / lockfile), REST + WebSocket, conversion de la champ select |
| `src/main/opgg` | client MCP OP.GG et parser de son format de réponse compact |
| `src/main/draft` | score des candidats (`score.ts`), collecte des données (`engine.ts`), modèle ML (`train.ts`) |
| `src/main/app.ts` | service exposé au renderer via IPC |
| `src/renderer` | interface React |
