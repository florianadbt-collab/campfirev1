# Nettoyage musical + première couche de combat

## Partie 1 — Suppression de Spotify et de la musique

Fichiers supprimés :
- `src/lib/spotify/` (spotify.server.ts, spotify.functions.ts, moods.ts)
- `src/routes/api/public/spotify/callback.ts`
- `src/components/game/spotify-panel.tsx`
- `src/components/game/music-player.tsx`

Nettoyages dans le code existant :
- `campaigns.$id_.play.tsx` : retrait de l'effet d'ambiance Spotify, des imports `MusicPlayer` / `spotifyAmbiance` / `MusicCommand` et de la prop `musicSuggestion`.
- `gm-tools.tsx` et `game-menus.tsx` : retrait du lecteur, du panneau Spotify et des props musicales. Aucun autre menu n'est touché.
- `src/lib/ai/types.ts` : suppression de `music_query`, `music_command` et de la tâche `generateMusic`.
- `src/lib/ai/ai-service.ts` : suppression de `AIService.generateMusic`.
- `src/lib/ai/gemini-engine.server.ts` : suppression de `parseMusicCommand`, de la branche `generateMusic`, des ambiances libres de droits et des consignes musicales du prompt. Le reste du prompt (narration, images, dés, tours) est conservé tel quel.
- La barre d'ambiance (lieu, heure, météo, tension) est **conservée** : elle est narrative, pas musicale.

Base de données : la table `spotify_connections` n'est utilisée que par Spotify. Elle sera supprimée par migration (aucune autre fonctionnalité n'y fait référence). Les secrets Spotify devenus inutilisés seront signalés comme supprimables.

## Partie 2 — Système de combat (V1)

### Source de vérité : le serveur

Deux nouvelles tables, avec RLS et GRANT alignés sur les tables existantes (membres de campagne en lecture, MJ/serveur en écriture) :

```text
combats
  id, campaign_id, status (active|victory|defeat|flight|interrupted|ended),
  round, turn_index, initiative jsonb (liste ordonnée de participants),
  active_participant text, created_at, ended_at

combat_enemies
  id, combat_id, name, level, max_hp, hp, status_label,
  is_defeated, sort_order
```

Realtime : la souscription existante de l'écran de jeu est étendue à ces deux tables — pas de nouveau mécanisme de synchronisation.

### Détection et affichage du combat

- Gemini renvoie déjà `scene_state`. Quand la scène passe en `COMBAT`, Campfire crée (ou met à jour) le combat côté serveur à partir du bloc `combat` structuré retourné par Gemini (liste d'ennemis avec nom, niveau, PV).
- Interface : bandeau **COMBAT** discret au-dessus du récit (round, participant actif), léger changement de teinte. Le reste de l'écran ne change pas.

### Ennemis et santé

- Carte compacte par ennemi : nom, niveau, barre de santé (10 segments) et libellé qualitatif (En pleine forme / Légèrement blessé / Blessé / Gravement blessé / À terre).
- Les joueurs voient le qualitatif ; le MJ voit en plus les PV exacts dans son panneau. Les PV réels restent toujours en base.

### Ciblage

- Une rangée de cibles sélectionnables sous la liste d'ennemis ; la cible active est mise en évidence.
- La cible est jointe à l'intention envoyée à Gemini (`playerIntent`) : acteur, action, cible.

### Tours

- Réutilisation du système existant (`turn-banner.tsx`, `sequentialTurn`). En combat, l'ordre provient de l'initiative stockée en base (joueurs + ennemis) et non plus d'un calcul purement local, afin que tous les appareils voient le même tour.
- Les tours ennemis sont résolus par le moteur puis narrés ; le tour repasse ensuite au joueur suivant.

### Actions et dés

- 3 à 4 actions contextuelles proposées par Gemini (`suggested_actions`), plus l'action libre déjà présente.
- Le système de dés existant reste inchangé : un jet n'est demandé que si Gemini renvoie `dice_request`. Aucun jet automatique par action.

### Résolution

Chaque action suit le cycle : action + cible → jet si demandé → réponse structurée de Gemini (`combat_update` : dégâts, statuts, ennemis vaincus, issue) → application côté serveur sur `combat_enemies` / `combats` → narration → tour suivant → propagation temps réel.

Gemini propose ; l'application décide et persiste. Les valeurs hors bornes sont clampées côté serveur.

### Fin de combat

Statut `victory | defeat | flight | interrupted`, retrait du bandeau, retour à la narration normale, historique conservé dans `messages` et résumé écrit dans `campaign_memory`.

## Volontairement hors périmètre

Grille tactique, déplacements, portées, résistances, avantage/désavantage, loot, IA tactique avancée, animations. La structure de données est prévue pour les accueillir plus tard.

## Détails techniques

Nouveaux fichiers : `src/lib/combat/combat.ts` (types + libellés de santé), `src/lib/combat/combat.functions.ts` (server functions authentifiées de création/mise à jour du combat), `src/components/game/combat-panel.tsx` (bandeau + ennemis + ciblage). Une migration pour les deux tables et la suppression de `spotify_connections`.
