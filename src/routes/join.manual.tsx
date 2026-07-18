import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { MobileShell } from "@/components/mobile-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getDeviceId, getStoredName, setStoredName } from "@/lib/device";
import { joinGameByCode } from "@/lib/join-game";

export const Route = createFileRoute("/join/manual")({
  head: () => ({
    meta: [
      { title: "Campfire — Rejoindre avec un code" },
      { name: "description", content: "Saisissez un code pour rejoindre une partie." },
    ],
  }),
  component: JoinManualPage,
});

function JoinManualPage() {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState(getStoredName());
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setStoredName(displayName.trim());
    const result = await joinGameByCode({
      code,
      displayName,
      deviceId: getDeviceId(),
    });
    setLoading(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    navigate({ to: "/lobby/$code", params: { code: result.inviteCode } });
  }

  return (
    <MobileShell>
      <div className="flex flex-1 flex-col gap-6 py-4">
        <div className="text-center">
          <h1 className="font-display text-3xl font-bold text-foreground">
            Rejoindre avec un code
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Entre le code fourni par ton MJ.
          </p>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <div className="space-y-2">
            <Label htmlFor="pseudo">Ton pseudo</Label>
            <Input
              id="pseudo"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={40}
              placeholder="Aventurier·e"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="code">Code de la partie</Label>
            <Input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={8}
              placeholder="ABC123"
              className="font-mono tracking-widest text-center text-lg"
              required
            />
          </div>

          {error && (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <button type="submit" disabled={loading} className="rpg-button disabled:opacity-50">
            <span className="font-display tracking-wide">
              {loading ? "Connexion…" : "Rejoindre"}
            </span>
          </button>
        </form>

        <Link to="/join" className="rpg-button">
          <ArrowLeft className="h-5 w-5 shrink-0 text-rpg" />
          <span className="font-display tracking-wide">Retour</span>
        </Link>
      </div>
    </MobileShell>
  );
}