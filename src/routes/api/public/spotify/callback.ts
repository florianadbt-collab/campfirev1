import { createFileRoute } from "@tanstack/react-router";

/**
 * Spotify OAuth callback.
 *
 * Public route (bypasses the published-site auth gate) so Spotify can reach it.
 * It only relays the authorization code back to the app window that opened the
 * popup; no token exchange happens here yet.
 */
export const Route = createFileRoute("/api/public/spotify/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");

        const payload = JSON.stringify({
          type: "spotifyOAuthCallback",
          code,
          state,
          error,
        });

        const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>Spotify</title></head>
<body style="background:#0a0a0f;color:#e7e3d8;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<p>${error ? "Connexion Spotify refusée." : "Spotify connecté. Vous pouvez fermer cette fenêtre."}</p>
<script>
  try { window.opener && window.opener.postMessage(${payload}, window.location.origin); } catch (e) {}
  setTimeout(function () { window.close(); }, 500);
</script>
</body></html>`;

        return new Response(html, {
          status: error ? 400 : 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      },
    },
  },
});