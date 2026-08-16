# Plan : Améliorer le diagnostic Spotify dans Campfire

## Problème constaté
Spotify renvoie un HTTP 403 sur les endpoints de lecture (`/v1/me`, `/v1/me/player/devices`) avec le message :  
`"Active premium subscription required for the owner of the app. When the subscription status changes, it can take a few hours before requests are allowed again."`

Le token est valide, mais Spotify bloque la fonctionnalité. Campfire affiche actuellement un message générique "Spotify Premium requis", ce qui masque la vraie cause.

## Objectif
Afficher le message d'erreur réel de Spotify à l'utilisateur et distinguer un "token OK mais fonctionnalité limitée" d'une vraie erreur de connexion.

## Étapes

1. **Lire les fichiers existants**
   - `src/lib/spotify/spotify.server.ts`
   - `src/lib/spotify/spotify.functions.ts`
   - `src/components/game/spotify-panel.tsx`
   - `src/routes/api/public/spotify/callback.ts`

2. **Modifier `spotify.server.ts`**
   - Lors d'un appel API Spotify qui échoue, parser le corps JSON de la réponse d'erreur.
   - Propager le champ `message` exact de Spotify dans l'objet d'erreur retourné.
   - Conserver le statut HTTP (403, 401, etc.) sans le remplacer par un libellé générique.

3. **Modifier `spotify.functions.ts` / API côté client**
   - S'assurer que le message d'erreur Spotify est transmis jusqu'à l'interface.
   - Ajouter un état `warning` distinct de `error` pour les connexions où le token est stocké mais une fonctionnalité est bloquée par Spotify.

4. **Modifier `spotify-panel.tsx` et le callback**
   - Afficher le message d'erreur exact de Spotify (ex. "Active premium subscription required for the owner of the app...").
   - Ajouter une aide contextuelle : "Vérifiez que l'application Spotify Developer appartient au compte Premium et réessayez dans quelques heures si l'abonnement est récent."

5. **Vérification**
   - Vérifier que le build passe (`build:dev` ou équivalent).
   - Vérifier les types TypeScript.

## Hors scope
- Ne pas contourner la restriction Spotify (impossible côté Campfire).
- Ne pas modifier le flux OAuth ou les scopes demandés.
