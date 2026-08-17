# Correction de l'erreur « Service IA indisponible (404) »

## Ce qui se passe

Le moteur essaie trois modèles Gemini dans l'ordre :
`gemini-flash-latest`, `gemini-2.5-flash`, puis `gemini-2.0-flash`.

J'ai interrogé l'API avec la clé du projet : **`gemini-2.0-flash` n'existe plus** dans la liste des modèles accessibles. Quand les deux premiers modèles échouent (surcharge 503), la chaîne finit sur ce modèle inexistant, Google répond 404, et c'est cette dernière erreur qui remonte à l'écran — d'où le message « Service IA indisponible (404) » au lieu du vrai message de surcharge.

Modèles réellement disponibles avec la clé actuelle (extrait) : `gemini-3.7-flash`, `gemini-3.6-flash`, `gemini-3.5-flash`, `gemini-2.5-flash`, `gemini-flash-latest`.

## Correction proposée

1. **Mettre à jour la chaîne de modèles** dans `src/lib/ai/gemini-engine.server.ts` avec des modèles existants et plus récents :
   `gemini-3.5-flash` → `gemini-2.5-flash` → `gemini-flash-latest`.
2. **Traiter le 404 comme une erreur de modèle**, pas comme une panne : on passe immédiatement au modèle suivant sans réessayer, et un 404 n'est jamais l'erreur affichée au joueur tant qu'un autre modèle reste à tester.
3. **Conserver la vraie cause pour l'utilisateur** : si tous les modèles échouent, on affiche l'erreur la plus significative (surcharge / quota) plutôt que la dernière rencontrée.

## Détails techniques

- `MODEL_CHAIN` mis à jour ; ajout d'un code d'erreur `ai_model_missing` pour le statut 404 dans `callOnce`.
- Dans `callGemini` : `ai_model_missing` sort de la boucle de retry et passe au modèle suivant ; on mémorise séparément la première erreur « significative » (503/429) pour la remonter en priorité.
- Aucun changement de base de données, d'UI ou de contrat IA. Le bouton « Réessayer » existant continue de fonctionner.
