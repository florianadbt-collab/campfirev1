import { createFileRoute } from "@tanstack/react-router";

/**
 * Spotify OAuth callback.
 *
 * Route publique (hors gate d'auth) : Spotify doit pouvoir l'atteindre.
 * L'échange code → tokens se fait ICI, côté serveur, car le callback atterrit
 * toujours sur l'origine de production alors que l'app peut tourner sur une
 * origine de préversion (postMessage cross-origin serait perdu).
 * Le MJ est identifié par le paramètre `state` signé (HMAC).
 */
export const Route = createFileRoute("/api/public/spotify/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");

        const mod = await import("@/lib/spotify/spotify.server");
        let status: "ok" | "error" = "ok";
        let detail = "Spotify connecté. Vous pouvez fermer cette fenêtre.";

        if (error) {
          status = "error";
          detail = `Connexion Spotify refusée (${error}).`;
          console.error("[spotify] oauth error from provider", { error });
        } else if (!code) {
          status = "error";
          detail = "Spotify n'a renvoyé aucun code d'autorisation.";
          console.error("[spotify] callback without code");
        } else {
          const userId = await mod.verifyState(state).catch(() => null);
          if (!userId) {
            status = "error";
            detail = "Requête OAuth invalide ou expirée (state). Relance la connexion.";
            console.error("[spotify] invalid state on callback");
          } else {
            try {
              const res = await mod.exchangeCode(userId, code);
              if (res.warning) {
                detail = `Spotify connecté. ${res.warning} Vous pouvez fermer cette fenêtre.`;
              }
              console.log("[spotify] tokens stored from callback", { userId });
            } catch (e) {
              status = "error";
              detail = mod.describeError(e);
              console.error("[spotify] token exchange failed", (e as Error).message);
            }
          }
        }

        const payload = JSON.stringify({ type: "spotifyOAuthCallback", status, detail });

        const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>Spotify</title></head>
<body style="background:#0a0a0f;color:#e7e3d8;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<p style="max-width:32ch;text-align:center">${detail}</p>
<script>
  // L'ouvreur peut être sur une autre origine (préversion) : on diffuse sans
  // secret, l'état réel est relu côté serveur par l'application.
  try { window.opener && window.opener.postMessage(${payload}, "*"); } catch (e) {}
  setTimeout(function () { window.close(); }, ${status === "ok" ? 900 : 3500});
</script>
</body></html>`;

        return new Response(html, {
          status: status === "ok" ? 200 : 400,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      },
    },
  },
});