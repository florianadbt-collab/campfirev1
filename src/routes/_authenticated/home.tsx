import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut, Plus, UserCircle, Users } from "lucide-react";
import { MobileShell } from "@/components/mobile-shell";
import { supabase } from "@/integrations/supabase/client";
import { clearLocalIdentity } from "@/lib/local-identity";

type CampaignRow = {
  id: string;
  name: string;
  description: string | null;
  genre: string | null;
  status: string;
  invite_code: string;
  owner_id: string;
};

function campaignsQuery() {
  return {
    queryKey: ["campaigns", "mine"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return [] as CampaignRow[];

      const { data: memberships, error: memErr } = await supabase
        .from("campaign_players")
        .select("campaign_id")
        .eq("user_id", userId);
      if (memErr) throw memErr;

      const ids = (memberships ?? []).map((m) => m.campaign_id);
      if (ids.length === 0) return [] as CampaignRow[];

      const { data: campaigns, error: cErr } = await supabase
        .from("campaigns")
        .select("id, name, description, genre, status, invite_code, owner_id")
        .in("id", ids)
        .order("created_at", { ascending: false });
      if (cErr) throw cErr;
      return (campaigns ?? []) as CampaignRow[];
    },
  };
}

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({
    meta: [
      { title: "Campfire — Mes campagnes" },
      { name: "description", content: "Vos campagnes Campfire." },
    ],
  }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(campaignsQuery());
  },
  component: HomePage,
});

function HomePage() {
  const { data: campaigns } = useSuspenseQuery(campaignsQuery());
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    clearLocalIdentity();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  return (
    <MobileShell>
      <header className="flex items-center justify-between pb-6">
        <h1 className="font-display text-2xl font-bold tracking-wide text-foreground">Campfire</h1>
        <div className="flex items-center gap-2">
          <Link to="/profile" className="rounded-full border border-rpg/30 bg-card p-2 text-rpg">
            <UserCircle className="h-5 w-5" />
          </Link>
          <button
            type="button"
            onClick={handleSignOut}
            className="rounded-full border border-rpg/30 bg-card p-2 text-rpg"
            aria-label="Se déconnecter"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>

      <section className="flex flex-1 flex-col gap-6">
        <div className="flex flex-col gap-3">
          <Link to="/campaigns/create" className="rpg-button">
            <Plus className="h-6 w-6 shrink-0 text-rpg" />
            <span className="font-display tracking-wide">Créer une campagne</span>
          </Link>
          <Link to="/campaigns/join" className="rpg-button">
            <Users className="h-6 w-6 shrink-0 text-rpg" />
            <span className="font-display tracking-wide">Rejoindre une campagne</span>
          </Link>
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="font-display text-lg tracking-wide text-foreground">Mes campagnes</h2>
          {campaigns.length === 0 ? (
            <p className="rounded-2xl border border-rpg/20 bg-card/50 p-4 text-sm text-muted-foreground">
              Aucune campagne. Créez-en une ou rejoignez-en une avec un code.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {campaigns.map((c) => (
                <li key={c.id}>
                  <Link
                    to="/campaigns/$id"
                    params={{ id: c.id }}
                    className="block rounded-2xl border border-rpg/30 bg-card p-4 transition-colors hover:border-rpg"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-display text-lg text-foreground">{c.name}</p>
                        {c.genre && (
                          <p className="mt-1 text-xs uppercase tracking-wider text-rpg">{c.genre}</p>
                        )}
                        {c.description && (
                          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{c.description}</p>
                        )}
                      </div>
                      <span className="shrink-0 rounded-full border border-rpg/30 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                        {c.status}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </MobileShell>
  );
}