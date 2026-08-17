/**
 * Couche d'immersion — mémoire persistante du monde (serveur uniquement).
 *
 * Deux responsabilités, et rien d'autre :
 *  1. loadWorldContext : rassembler l'état réel de la campagne pour Gemini.
 *  2. applyWorldUpdate : enregistrer ce que la scène vient de changer.
 *
 * Campfire reste la source de vérité : Gemini propose, Campfire écrit.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Json } from "@/lib/ai/types";
import {
  clampScore,
  stanceFrom,
  DEFAULT_WORLD_TIME,
  type ConditionRow,
  type MemoryRow,
  type NpcRelationRow,
  type NpcRow,
  type WorldTime,
} from "./world";

type Client = SupabaseClient<any, "public", any>;

const PARTY = "party";
const MEMORY_LIMIT = 60;
const NAMED_KINDS = new Set(["location", "faction", "quest", "reputation", "npc_secret"]);

/* ------------------------------------------------------------------ lecture */

export interface WorldSnapshot {
  time: WorldTime;
  memory: MemoryRow[];
  npcs: NpcRow[];
  relations: NpcRelationRow[];
  conditions: ConditionRow[];
  characters: {
    user_id: string;
    name: string;
    race: string | null;
    class_profession: string | null;
    level: number;
  }[];
}

export async function readWorld(supabase: Client, campaignId: string): Promise<WorldSnapshot> {
  const [campaign, memory, npcs, relations, conditions, characters] = await Promise.all([
    supabase.from("campaigns").select("world_state").eq("id", campaignId).maybeSingle(),
    supabase
      .from("campaign_memory")
      .select("id, kind, content, visibility, importance, campaign_day, user_id, metadata, created_at")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false })
      .limit(MEMORY_LIMIT),
    supabase.from("campaign_npcs").select("*").eq("campaign_id", campaignId).limit(60),
    supabase.from("npc_relations").select("*").eq("campaign_id", campaignId).limit(200),
    supabase
      .from("character_conditions")
      .select("id, user_id, label, severity, is_active")
      .eq("campaign_id", campaignId)
      .eq("is_active", true),
    supabase
      .from("characters")
      .select("user_id, name, race, class_profession, level")
      .eq("campaign_id", campaignId),
  ]);

  const state = (campaign.data?.["world_state"] ?? {}) as Partial<WorldTime>;
  return {
    time: {
      day: Number(state.day ?? DEFAULT_WORLD_TIME.day) || 1,
      time_of_day: String(state.time_of_day ?? ""),
      weather: String(state.weather ?? ""),
      location: String(state.location ?? ""),
    },
    memory: ((memory.data ?? []) as MemoryRow[]).slice().reverse(),
    npcs: (npcs.data ?? []) as NpcRow[],
    relations: (relations.data ?? []) as NpcRelationRow[],
    conditions: (conditions.data ?? []) as ConditionRow[],
    characters: (characters.data ?? []) as WorldSnapshot["characters"],
  };
}

/** Mise en forme du snapshot pour le prompt : concis, lisible, sans bruit. */
export function worldContextFrom(snap: WorldSnapshot) {
  const byKind = (kind: string) => snap.memory.filter((m) => m.kind === kind);
  const publicMemory = snap.memory.filter((m) => m.visibility !== "gm");

  const relationsByNpc = new Map<string, NpcRelationRow[]>();
  for (const r of snap.relations) {
    relationsByNpc.set(r.npc_id, [...(relationsByNpc.get(r.npc_id) ?? []), r]);
  }

  const npcRegistry = snap.npcs.map((n) => ({
    name: n.name,
    role: n.role_label,
    faction: n.faction,
    personality: n.personality,
    speech_style: n.speech_style,
    appearance: n.appearance,
    status: n.status,
    location: n.location,
    alive: n.is_alive,
    last_seen_day: n.last_seen_day,
    relations: (relationsByNpc.get(n.id) ?? []).map((r) => ({
      target: r.user_id ?? PARTY,
      stance: r.stance,
      opinion: r.opinion,
      last_event: r.last_event,
    })),
  }));

  return {
    canonicalWorldState: {
      time: snap.time,
      locations: byKind("location").map((m) => ({
        name: m.metadata?.["name"] ?? m.content,
        note: m.content,
        known_by: m.visibility === "private" ? m.user_id : PARTY,
      })),
      quests: byKind("quest").map((m) => ({
        name: m.metadata?.["name"] ?? "",
        status: m.metadata?.["status"] ?? "ouverte",
        note: m.content,
        day: m.campaign_day,
      })),
      reputation: byKind("reputation").map((m) => ({
        scope: m.metadata?.["name"] ?? "",
        target: m.user_id ?? PARTY,
        note: m.content,
      })),
      conditions: snap.conditions.map((c) => ({
        user_id: c.user_id,
        label: c.label,
        severity: c.severity,
      })),
      characters: snap.characters.map((c) => ({
        user_id: c.user_id,
        name: c.name,
        race: c.race,
        class: c.class_profession,
        level: c.level,
      })),
    } as Json,
    worldTimeline: [...publicMemory]
      .filter((m) => m.kind === "event" || m.kind === "world_event")
      .slice(-20)
      .map((m) => ({
        day: m.campaign_day,
        kind: m.kind,
        importance: m.importance,
        summary: m.content,
      })) as Json,
    npcRegistry: npcRegistry as unknown as Json,
    factionRegistry: byKind("faction").map((m) => ({
      name: m.metadata?.["name"] ?? "",
      stance: m.metadata?.["stance"] ?? "",
      note: m.content,
    })) as Json,
    secretKnowledge: snap.memory
      .filter((m) => m.visibility === "gm")
      .slice(-15)
      .map((m) => ({
        kind: m.kind,
        about: m.metadata?.["name"] ?? "",
        secret: m.content,
      })) as Json,
  };
}

/* --------------------------------------------------------------- écriture */

type Row = Record<string, unknown>;

const str = (v: unknown, max = 400) => String(v ?? "").trim().slice(0, max);
const arr = (v: unknown): Row[] =>
  Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Row[]) : [];

function visibilityOf(v: unknown): "public" | "gm" | "private" {
  const value = str(v).toLowerCase();
  return value === "gm" || value === "private" ? value : "public";
}

/**
 * Applique le bloc `world_update` d'une scène.
 * Chaque section est indépendante : une donnée invalide n'empêche pas les autres.
 */
export async function applyWorldUpdate(
  supabase: Client,
  campaignId: string,
  update: unknown,
): Promise<void> {
  if (!update || typeof update !== "object" || Array.isArray(update)) return;
  const u = update as Row;

  const snap = await readWorld(supabase, campaignId);
  const day = await applyTime(supabase, campaignId, snap.time, u["time"]);

  await Promise.all([
    applyEvents(supabase, campaignId, day, u),
    applyNamed(supabase, campaignId, day, snap.memory, u),
    applyNpcs(supabase, campaignId, day, snap.npcs, u),
    applyConditions(supabase, campaignId, u["conditions"]),
  ]);
}

async function applyTime(
  supabase: Client,
  campaignId: string,
  current: WorldTime,
  value: unknown,
): Promise<number> {
  if (!value || typeof value !== "object") return current.day;
  const t = value as Row;
  // Le temps ne recule jamais : la continuité prime sur la proposition de l'IA.
  const day = Math.max(current.day, Math.min(current.day + 30, Number(t["day"] ?? current.day) || current.day));
  const next: WorldTime = {
    day,
    time_of_day: str(t["time_of_day"], 40) || current.time_of_day,
    weather: str(t["weather"], 60) || current.weather,
    location: str(t["location"], 80) || current.location,
  };
  await supabase.from("campaigns").update({ world_state: next as never }).eq("id", campaignId);
  return day;
}

async function applyEvents(supabase: Client, campaignId: string, day: number, u: Row) {
  const rows = [
    ...arr(u["events"]).map((e) => ({ ...e, kind: "event" })),
    ...arr(u["world_events"]).map((e) => ({ ...e, kind: "world_event" })),
  ]
    .map((e) => ({
      campaign_id: campaignId,
      kind: String(e["kind"]),
      content: str(e["summary"] ?? e["content"], 600),
      visibility: visibilityOf(e["visibility"]),
      importance: str(e["importance"], 20) === "major" ? "major" : "minor",
      campaign_day: day,
      user_id: uuidOrNull(e["user_id"]),
      metadata: { tags: Array.isArray(e["tags"]) ? e["tags"].slice(0, 5) : [] } as never,
    }))
    .filter((e) => e.content)
    .slice(0, 6);
  if (rows.length) await supabase.from("campaign_memory").insert(rows);
}

/** Lieux, factions, quêtes, réputations, secrets : une seule ligne par nom. */
async function applyNamed(
  supabase: Client,
  campaignId: string,
  day: number,
  existing: MemoryRow[],
  u: Row,
) {
  const entries: {
    kind: string;
    name: string;
    content: string;
    visibility: "public" | "gm" | "private";
    user_id: string | null;
    metadata: Record<string, unknown>;
  }[] = [];

  for (const l of arr(u["locations"])) {
    const name = str(l["name"], 80);
    if (name) {
      entries.push({
        kind: "location",
        name,
        content: str(l["summary"], 400) || name,
        visibility: visibilityOf(l["visibility"]),
        user_id: uuidOrNull(l["user_id"]),
        metadata: { name },
      });
    }
  }
  for (const f of arr(u["factions"])) {
    const name = str(f["name"], 80);
    if (name) {
      entries.push({
        kind: "faction",
        name,
        content: str(f["summary"], 400) || name,
        visibility: visibilityOf(f["visibility"]),
        user_id: null,
        metadata: { name, stance: str(f["stance"], 40) },
      });
    }
  }
  for (const q of arr(u["quests"])) {
    const name = str(q["name"], 80);
    if (name) {
      entries.push({
        kind: "quest",
        name,
        content: str(q["summary"], 400) || name,
        visibility: visibilityOf(q["visibility"]),
        user_id: null,
        metadata: { name, status: str(q["status"], 30) || "ouverte" },
      });
    }
  }
  for (const r of arr(u["reputation"])) {
    const name = str(r["scope"] ?? r["name"], 80);
    if (name) {
      entries.push({
        kind: "reputation",
        name,
        content: str(r["summary"], 400) || name,
        visibility: "gm",
        user_id: uuidOrNull(r["user_id"]),
        metadata: { name },
      });
    }
  }
  for (const n of arr(u["npcs"])) {
    const secret = str(n["secret"], 400);
    const name = str(n["name"], 80);
    if (secret && name) {
      entries.push({
        kind: "npc_secret",
        name,
        content: secret,
        visibility: "gm",
        user_id: null,
        metadata: { name },
      });
    }
  }

  for (const entry of entries.slice(0, 12)) {
    if (!NAMED_KINDS.has(entry.kind)) continue;
    const previous = existing.find(
      (m) =>
        m.kind === entry.kind &&
        String(m.metadata?.["name"] ?? "").toLowerCase() === entry.name.toLowerCase() &&
        (m.user_id ?? null) === entry.user_id,
    );
    const payload = {
      content: entry.content,
      visibility: entry.visibility,
      metadata: entry.metadata as never,
      campaign_day: day,
    };
    if (previous) {
      await supabase.from("campaign_memory").update(payload).eq("id", previous.id);
    } else {
      await supabase.from("campaign_memory").insert({
        campaign_id: campaignId,
        kind: entry.kind,
        user_id: entry.user_id,
        importance: "minor",
        ...payload,
      });
    }
  }
}

async function applyNpcs(
  supabase: Client,
  campaignId: string,
  day: number,
  existing: NpcRow[],
  u: Row,
) {
  const byName = new Map(existing.map((n) => [n.name.toLowerCase(), n]));

  for (const raw of arr(u["npcs"]).slice(0, 6)) {
    const name = str(raw["name"], 80);
    if (!name) continue;
    const known = byName.get(name.toLowerCase());
    const fields = {
      role_label: str(raw["role"], 80),
      faction: str(raw["faction"], 80),
      personality: str(raw["personality"], 200),
      speech_style: str(raw["speech_style"], 160),
      appearance: str(raw["appearance"], 200),
      status: str(raw["status"], 120),
      location: str(raw["location"], 80),
      is_alive: raw["alive"] === undefined ? true : Boolean(raw["alive"]),
      last_seen_day: day,
    };
    if (known) {
      // On n'écrase jamais une caractéristique déjà connue par une chaîne vide.
      const patch: Row = { last_seen_day: day, is_alive: fields.is_alive };
      for (const [key, value] of Object.entries(fields)) {
        if (typeof value === "string" && value) patch[key] = value;
      }
      await supabase.from("campaign_npcs").update(patch).eq("id", known.id);
    } else {
      const { data } = await supabase
        .from("campaign_npcs")
        .insert({ campaign_id: campaignId, name, first_seen_day: day, ...fields })
        .select("*")
        .maybeSingle();
      if (data) byName.set(name.toLowerCase(), data as NpcRow);
    }
  }

  await applyRelations(supabase, campaignId, byName, u["relations"]);
}

/** Les relations évoluent par petites variations, jamais par sauts brutaux. */
async function applyRelations(
  supabase: Client,
  campaignId: string,
  npcs: Map<string, NpcRow>,
  value: unknown,
) {
  for (const raw of arr(value).slice(0, 8)) {
    const npc = npcs.get(str(raw["npc"], 80).toLowerCase());
    if (!npc) continue;
    const target = str(raw["user_id"], 60);
    const userId = target && target !== PARTY ? uuidOrNull(target) : null;

    const query = supabase
      .from("npc_relations")
      .select("*")
      .eq("npc_id", npc.id)
      .limit(1);
    const { data: found } = await (userId
      ? query.eq("user_id", userId)
      : query.is("user_id", null)
    ).maybeSingle();
    const current = (found ?? null) as NpcRelationRow | null;

    const delta = (key: string) => Math.max(-25, Math.min(25, Number(raw[key] ?? 0) || 0));
    const trust = clampScore((current?.trust ?? 0) + delta("trust"));
    const suspicion = clampScore((current?.suspicion ?? 0) + delta("suspicion"));
    const hostility = clampScore((current?.hostility ?? 0) + delta("hostility"));
    const payload = {
      trust,
      suspicion,
      hostility,
      stance: stanceFrom(trust, suspicion, hostility),
      opinion: str(raw["opinion"], 240) || current?.opinion || "",
      last_event: str(raw["reason"], 240) || current?.last_event || "",
    };

    if (current) {
      await supabase.from("npc_relations").update(payload).eq("id", current.id);
    } else {
      await supabase
        .from("npc_relations")
        .insert({ campaign_id: campaignId, npc_id: npc.id, user_id: userId, ...payload });
    }
  }
}

/** Blessures et séquelles : narratif, pas médical. */
async function applyConditions(supabase: Client, campaignId: string, value: unknown) {
  for (const raw of arr(value).slice(0, 6)) {
    const userId = uuidOrNull(raw["user_id"]);
    const label = str(raw["label"], 120);
    if (!userId || !label) continue;
    const healed = Boolean(raw["healed"]);
    const severity = ["legere", "serieuse", "grave"].includes(str(raw["severity"], 20))
      ? str(raw["severity"], 20)
      : "legere";
    await supabase.from("character_conditions").upsert(
      {
        campaign_id: campaignId,
        user_id: userId,
        label,
        severity,
        is_active: !healed,
      },
      { onConflict: "campaign_id,user_id,label" },
    );
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function uuidOrNull(value: unknown): string | null {
  const v = String(value ?? "").trim();
  return UUID_RE.test(v) ? v : null;
}
