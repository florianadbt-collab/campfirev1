import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { MobileShell } from "@/components/mobile-shell";
import { supabase } from "@/integrations/supabase/client";

function profileQuery() {
  return {
    queryKey: ["profile", "me"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Non connecté");

      const [{ data: profile, error: pErr }, { data: memberships, error: mErr }] = await Promise.all([
        supabase.from("profiles").select("id, username, avatar_url").eq("id", userId).maybeSingle(),
        supabase
          .from("campaign_players")
          .select("role, campaigns(id, name, status)")
          .eq("user_id", userId),
      ]);
      if (pErr) throw pErr;
      if (mErr) throw mErr;

      return {
        email: userData.user?.email ?? "",
        profile: profile ?? { id: userId, username: "", avatar_url: null as string | null },
        memberships: memberships ?? [],
      };
    },
  };
}

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Campfire — Profil" },
      { name: "description", content: "Votre profil Campfire." },
    ],
  }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(profileQuery());
  },
  component: ProfilePage,
});

function ProfilePage() {
  const { data } = useSuspenseQuery(profileQuery());
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [username, setUsername] = useState(data.profile.username);
  const [avatarUrl, setAvatarUrl] = useState(data.profile.avatar_url ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setInfo(null);
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ username: username.trim(), avatar_url: avatarUrl.trim() || null })
      .eq("id", data.profile.id);
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
    } else {
      setInfo("Profil mis à jour.");
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    }
  }

  return (
    <MobileShell>
      <header className="flex items-center gap-3 pb-6">
        <button
          type="button"
          onClick={() => navigate({ to: "/home" })}
          className="rounded-full border border-rpg/30 bg-card p-2 text-rpg"
          aria-label="Retour"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="font-display text-xl tracking-wide text-foreground">Mon profil</h1>
      </header>

      <form onSubmit={handleSave} className="flex flex-col gap-5">
        <div className="flex items-center gap-4">
          <div className="h-20 w-20 overflow-hidden rounded-full border border-rpg/30 bg-card">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center font-display text-2xl text-rpg">
                {(username || "?").slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-lg text-foreground">{username || "—"}</p>
            <p className="truncate text-xs text-muted-foreground">{data.email}</p>
          </div>
        </div>

        <label className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Nom d'utilisateur
          </span>
          <input
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="rpg-input"
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Avatar (URL)
          </span>
          <input
            type="url"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            className="rpg-input"
            placeholder="https://..."
          />
        </label>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {info && <p className="text-sm text-rpg">{info}</p>}

        <button type="submit" disabled={saving} className="rpg-button disabled:opacity-50">
          <span className="font-display tracking-wide">{saving ? "..." : "Enregistrer"}</span>
        </button>
      </form>

      <section className="mt-8 flex flex-col gap-3">
        <h2 className="font-display text-lg tracking-wide text-foreground">Mes campagnes</h2>
        {data.memberships.length === 0 ? (
          <p className="rounded-2xl border border-rpg/20 bg-card/50 p-4 text-sm text-muted-foreground">
            Aucune campagne pour l'instant.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.memberships.map((m, idx) => {
              const campaign = m.campaigns as { id: string; name: string; status: string } | null;
              if (!campaign) return null;
              return (
                <li key={campaign.id ?? idx}>
                  <Link
                    to="/campaigns/$id"
                    params={{ id: campaign.id }}
                    className="flex items-center justify-between rounded-2xl border border-rpg/30 bg-card p-3"
                  >
                    <span className="font-display tracking-wide text-foreground">{campaign.name}</span>
                    <span className="text-xs uppercase tracking-wider text-rpg">{m.role}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </MobileShell>
  );
}