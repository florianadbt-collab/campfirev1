/**
 * gemini-engine — point unique d'appel à Gemini (serveur uniquement).
 * Aucune clé d'API n'existe côté navigateur : elle est lue ici, à l'exécution.
 */
import type { AIDebugInfo, AIRequest, AIResult, AITask, Json, SceneResponse } from "./types";
import { SHEET_JSON_CONTRACT } from "@/lib/character-sheet";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3.6-flash";
const IMAGE_MODEL = "google/gemini-3-pro-image-preview";

/* ------------------------------------------------------------------ prompts */

function contextBlock(req: AIRequest): string {
  const ctx = req.context ?? {};
  const blocks: string[] = [];
  const push = (label: string, value: unknown) => {
    if (value === undefined || value === null) return;
    blocks.push(`### ${label}\n${JSON.stringify(value, null, 2)}`);
  };
  push("Campaign Seed", ctx.campaignSeed);
  push("Canonical World State", ctx.canonicalWorldState);
  push("State Delta", ctx.stateDelta);
  push("Player Intent", ctx.playerIntent);
  push("World Timeline", ctx.worldTimeline);
  push("Active Clocks", ctx.activeClocks);
  push("NPC Registry", ctx.npcRegistry);
  push("Faction Registry", ctx.factionRegistry);
  push("Secret Knowledge", ctx.secretKnowledge);
  return blocks.join("\n\n");
}

const SYSTEM_PROMPT =
  "Tu es le Maître du Jeu (MJ) de Campfire, un jeu de rôle narratif. " +
  "Tu écris en français simple et naturel, comme un très bon MJ humain à une table. " +
  "Phrases courtes. Vocabulaire courant, jamais littéraire ni pompeux. " +
  "Tu décris ce qui se passe, tu ne fais pas de poésie. Pas de métaphores rares, pas de mots savants. " +
  "La narration est l'essentiel : les dialogues restent rares et courts. " +
  "Tu réponds TOUJOURS avec un unique objet JSON valide, sans texte autour, sans balises markdown.";

const SCENE_JSON_CONTRACT =
  '{"scene_title":string,"narration":string,"scene_mood":string,"location":string,"world_time":string,' +
  '"weather":string,"tension":number,"music_query":string,"image_prompt":string,' +
  '"dialogues":[{"speaker":string,"line":string}],' +
  '"dice_request":{"formula":string,"threshold":number,"reason":string,"ability":string}|null,' +
  '"scene_state":"NARRATION"|"PLAYER_TURN"|"GROUP_CHOICE"|"COMBAT"|"DIALOGUE",' +
  '"active_players":[string],"initiative":[string],"waiting_for_input":boolean,' +
  '"allow_parallel_inputs":boolean,"requires_mj_confirmation":boolean,' +
  '"read_aloud":string,"gm_notes":string,"gm_secrets":[string],"offscreen_events":[string],' +
  '"suggested_actions":[string,string,string]}';

const SCENE_RULES = [
  "Règles de rédaction :",
  "- narration : 100 à 180 mots, phrases courtes, langage parlé mais soigné, au présent.",
  "- dialogues : 0 à 2 répliques maximum, uniquement si un personnage parle vraiment. Sinon tableau vide.",
  "- tension : entier de 0 à 100.",
  "- location, world_time (ex: \"Jour 3 — 17h20\"), weather : toujours renseignés, en français.",
  "- music_query et image_prompt en anglais.",
  "- suggested_actions : 3 ou 4 actions courtes, concrètes, à la 2e personne.",
  "- dice_request : uniquement si l'action demande un test incertain, sinon null. formula type \"1d20\", threshold entier.",
  "",
  "Gestion du tour (obligatoire) :",
  "- scene_state : PLAYER_TURN (un seul joueur agit), GROUP_CHOICE (tous peuvent répondre),",
  "  DIALOGUE (échange en cours, seul le joueur concerné répond), COMBAT (ordre d'initiative), NARRATION (personne n'agit).",
  "- active_players : tableau d'identifiants pris EXACTEMENT dans la liste des joueurs fournie (champ id). Vide si NARRATION.",
  "- initiative : en COMBAT uniquement, tous les identifiants dans l'ordre d'action. Sinon tableau vide.",
  "- waiting_for_input : true si tu attends une action d'un joueur.",
  "- allow_parallel_inputs : true seulement en GROUP_CHOICE.",
  "- requires_mj_confirmation : true quand la scène peut avancer d'elle-même et que tu attends le feu vert du MJ.",
  "",
  "Bloc MJ (jamais montré aux joueurs) :",
  "- read_aloud : court texte que le MJ peut lire à voix haute aux joueurs.",
  "- gm_notes : ce que le MJ doit savoir (intentions des PNJ, pièges, rythme).",
  "- gm_secrets : 0 à 3 secrets non encore révélés.",
  "- offscreen_events : 0 à 3 événements qui se déroulent hors champ.",
].join("\n");

export function buildPrompt(req: AIRequest): string {
  const p = req.payload ?? {};
  const ctx = contextBlock(req);
  const suffix = ctx ? `\n\n## Contexte du monde\n${ctx}` : "";

  switch (req.task) {
    case "startCampaign": {
      const seed = req.context?.campaignSeed;
      const characters = (p["characters"] as unknown[]) ?? [];
      return (
        [
          "Écris la scène d'ouverture de la campagne.",
          `Nom de la campagne : ${seed?.name ?? "Sans nom"}`,
          `Joueurs de la table (utilise ces identifiants) : ${JSON.stringify(p["roster"] ?? [])}`,
          `Type de campagne : ${seed?.type ?? "Libre"}`,
          `Description de l'univers : ${seed?.universe ?? "Non précisée"}`,
          `Le MJ participe aussi comme joueur : ${seed?.gmPlays ? "oui" : "non"}`,
          `Personnages créés : ${characters.length ? JSON.stringify(characters) : "aucun pour l'instant"}`,
          "",
          SCENE_RULES,
          "Pour l'ouverture, dice_request doit être null.",
          "",
          "Réponds avec ce JSON exact :",
          SCENE_JSON_CONTRACT,
        ].join("\n") + suffix
      );
    }
    case "playTurn": {
      const intent = req.context?.playerIntent as Record<string, unknown> | undefined;
      const roll = intent?.["roll"];
      const roster = (req.payload?.["roster"] as unknown) ?? [];
      const advance = String(intent?.["text"] ?? "") === "ADVANCE_SCENE";
      return (
        [
          "Poursuis la partie.",
          `Joueurs de la table (utilise ces identifiants) : ${JSON.stringify(roster)}`,
          advance
            ? "Le MJ humain demande ADVANCE_SCENE : laisse simplement la scène évoluer naturellement, sans forcer d'événement majeur."
            : "Voici ce que fait le joueur :",
          `Personnage : ${String(intent?.["character"] ?? "Un joueur")}`,
          `Identifiant du joueur : ${String(intent?.["user_id"] ?? "inconnu")}`,
          `Action : ${String(intent?.["text"] ?? "")}`,
          roll ? `Résultat de dés fourni : ${JSON.stringify(roll)}. Tiens-en compte dans l'issue.` : "",
          "",
          "Enchaîne directement sur les conséquences. Reste cohérent avec les scènes précédentes.",
          SCENE_RULES,
          "",
          "Réponds avec ce JSON exact :",
          SCENE_JSON_CONTRACT,
        ]
          .filter(Boolean)
          .join("\n") + suffix
      );
    }
    default:
      return `Tâche : ${req.task}\nDonnées : ${JSON.stringify(p)}${suffix}`;
  }
}

function campaignBrief(req: AIRequest): string[] {
  const seed = req.context?.campaignSeed;
  return [
    `Campagne : ${seed?.name ?? "Sans nom"}`,
    `Type / ton : ${seed?.type ?? "Libre"}`,
    `Univers : ${seed?.universe ?? "Non précisé"}`,
  ];
}

function buildCharacterPrompt(req: AIRequest): string {
  const p = req.payload ?? {};
  const ctx = contextBlock(req);
  const suffix = ctx ? `\n\n## Contexte du monde\n${ctx}` : "";

  if (req.task === "importCharacter") {
    const text = String(p["documentText"] ?? "");
    return (
      [
        "Analyse la fiche de personnage fournie (document joint et/ou texte ci-dessous) et convertis-la en JSON.",
        "RÈGLE ABSOLUE : n'invente jamais une information absente. Laisse une chaîne vide ou un tableau vide.",
        ...campaignBrief(req),
        "",
        text ? `Contenu du document :\n${text.slice(0, 20000)}` : "Le document est joint à ce message.",
        "",
        "Réponds avec ce JSON exact :",
        SHEET_JSON_CONTRACT,
      ].join("\n") + suffix
    );
  }

  const description = String(p["description"] ?? "").trim();
  return (
    [
      "Crée un personnage jouable complet, parfaitement intégré à cet univers.",
      ...campaignBrief(req),
      description
        ? `Souhait du joueur : ${description}`
        : "Le joueur ne donne aucune indication : surprends-le, mais reste cohérent avec l'univers.",
      "",
      "Le personnage doit sembler avoir toujours appartenu à ce monde : nom, race/peuple, classe/métier,",
      "factions, ton et difficulté de la campagne doivent transparaître. Écris en français.",
      "motivation : une motivation personnelle intime, en une ou deux phrases.",
      "attributes : 4 à 6 caractéristiques adaptées au genre. abilities : 3 à 6 compétences. inventory : 3 à 6 objets de départ.",
      "",
      "Réponds avec ce JSON exact :",
      SHEET_JSON_CONTRACT,
    ].join("\n") + suffix
  );
}

const CHARACTER_TASKS = new Set<AITask>(["generateCharacter", "importCharacter"]);

function promptFor(req: AIRequest): string {
  return CHARACTER_TASKS.has(req.task) ? buildCharacterPrompt(req) : buildPrompt(req);
}

function userContent(req: AIRequest, prompt: string): unknown {
  const files = req.attachments ?? [];
  if (files.length === 0) return prompt;
  return [
    { type: "text", text: prompt },
    ...files.map((f) => ({ type: "image_url", image_url: { url: f.dataUrl } })),
  ];
}

/* ------------------------------------------------------------- appel Gemini */

function extractJson(raw: string): unknown {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end <= start) throw new Error("Réponse IA non JSON");
    return JSON.parse(cleaned.slice(start, end + 1));
  }
}

type EngineError = Error & { code?: string; debug?: AIDebugInfo };

async function callGemini(
  prompt: string,
  task: AITask,
  content: unknown = prompt,
): Promise<{ value: unknown; debug: AIDebugInfo }> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  const startedAt = Date.now();
  if (!apiKey) {
    const err: EngineError = new Error("Service IA non configuré côté serveur.");
    err.code = "ai_unavailable";
    throw err;
  }

  const response = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content },
      ],
      response_format: { type: "json_object" },
    }),
  });

  const bodyText = await response.text();
  const durationMs = Date.now() - startedAt;

  if (!response.ok) {
    console.error(`[gemini-engine] ${task} failed [${response.status}]: ${bodyText}`);
    const err: EngineError = new Error(
      response.status === 429
        ? "Le MJ IA est momentanément saturé. Réessayez dans quelques instants."
        : response.status === 402
          ? "Crédits IA épuisés pour cet espace de travail."
          : `Service IA indisponible (${response.status}).`,
    );
    err.code =
      response.status === 429 ? "ai_rate_limited" : response.status === 402 ? "ai_no_credits" : "ai_unavailable";
    err.debug = { task, model: MODEL, prompt, raw: bodyText, durationMs, error: `HTTP ${response.status}` };
    throw err;
  }

  const json = JSON.parse(bodyText) as { choices?: { message?: { content?: string } }[] };
  const raw = json.choices?.[0]?.message?.content ?? "";
  const debug: AIDebugInfo = { task, model: MODEL, prompt, raw, durationMs };

  try {
    return { value: extractJson(raw), debug };
  } catch (e) {
    console.error(`[gemini-engine] ${task} bad JSON:`, raw);
    const err: EngineError = new Error("Le MJ IA a renvoyé une réponse illisible.");
    err.code = "ai_bad_json";
    err.debug = { ...debug, error: (e as Error).message };
    throw err;
  }
}

/* ------------------------------------------------------------- normalisation */

function normalizeScene(value: unknown): SceneResponse {
  const v = (value ?? {}) as Record<string, unknown>;
  const actions = Array.isArray(v["suggested_actions"])
    ? (v["suggested_actions"] as unknown[]).map(String)
    : [];
  const dialogues = Array.isArray(v["dialogues"])
    ? (v["dialogues"] as unknown[])
        .map((d) => {
          const o = (d ?? {}) as Record<string, unknown>;
          return { speaker: String(o["speaker"] ?? "").trim(), line: String(o["line"] ?? "").trim() };
        })
        .filter((d) => d.speaker && d.line)
    : [];
  const dr = v["dice_request"] as Record<string, unknown> | null | undefined;
  const diceRequest =
    dr && typeof dr === "object" && typeof dr["formula"] === "string" && dr["formula"]
      ? {
          formula: String(dr["formula"]),
          threshold: Number(dr["threshold"] ?? 10) || 10,
          reason: String(dr["reason"] ?? "Test"),
          ability: String(dr["ability"] ?? ""),
        }
      : null;
  return {
    scene_title: String(v["scene_title"] ?? "Ouverture"),
    narration: String(v["narration"] ?? ""),
    scene_mood: String(v["scene_mood"] ?? ""),
    music_query: String(v["music_query"] ?? ""),
    image_prompt: String(v["image_prompt"] ?? ""),
    suggested_actions: actions,
    location: String(v["location"] ?? ""),
    world_time: String(v["world_time"] ?? ""),
    weather: String(v["weather"] ?? ""),
    tension: Math.max(0, Math.min(100, Number(v["tension"] ?? 20) || 0)),
    dialogues,
    dice_request: diceRequest,
  };
}

/* ------------------------------------------------------------------- images */

const IMAGE_TASKS = new Set<AITask>(["generatePortrait", "generateSceneImage"]);

async function generateImage(prompt: string): Promise<string | null> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return null;
  const response = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: IMAGE_MODEL,
      messages: [{ role: "user", content: prompt }],
      modalities: ["image", "text"],
    }),
  });
  if (!response.ok) {
    console.error(`[gemini-engine] image failed [${response.status}]: ${await response.text()}`);
    return null;
  }
  const json = (await response.json()) as {
    choices?: { message?: { images?: { image_url?: { url?: string } }[] } }[];
  };
  return json.choices?.[0]?.message?.images?.[0]?.image_url?.url ?? null;
}

/** Ambiances sonores libres de droits — remplacées par Spotify en V2. */
const AMBIENCES: { key: string; url: string }[] = [
  { key: "tavern", url: "https://cdn.pixabay.com/audio/2022/03/15/audio_c8c8a73467.mp3" },
  { key: "forest", url: "https://cdn.pixabay.com/audio/2021/10/25/audio_65a3d1b1a3.mp3" },
  { key: "battle", url: "https://cdn.pixabay.com/audio/2022/10/30/audio_347111d3b6.mp3" },
];

function pickAmbience(query: string): string {
  const q = query.toLowerCase();
  if (/(battle|combat|fight|danger|chase)/.test(q)) return AMBIENCES[2]!.url;
  if (/(forest|wild|nature|travel|road|exploration)/.test(q)) return AMBIENCES[1]!.url;
  return AMBIENCES[0]!.url;
}

/* --------------------------------------------------------------- entrypoint */

export async function runGeminiEngine(req: AIRequest): Promise<AIResult> {
  const startedAt = Date.now();

  if (req.task === "generateMusic") {
    const query = String(req.payload?.["query"] ?? "dark fantasy ambient");
    return {
      ok: true,
      task: req.task,
      data: { music_url: pickAmbience(query), music_query: query } as Json,
      durationMs: Date.now() - startedAt,
    };
  }

  if (IMAGE_TASKS.has(req.task)) {
    const basePrompt = String(req.payload?.["prompt"] ?? "").trim();
    const imagePrompt =
      req.task === "generatePortrait"
        ? `Character portrait, painterly fantasy illustration, head and shoulders, dramatic lighting. ${basePrompt}`
        : `Wide cinematic fantasy scene illustration, atmospheric lighting. ${basePrompt}`;
    const url = await generateImage(imagePrompt);
    return {
      ok: true,
      task: req.task,
      data: { image_url: url, image_prompt: imagePrompt } as Json,
      durationMs: Date.now() - startedAt,
      ...(url ? {} : { simulated: true }),
    };
  }

  if (req.task === "playTurn") await attachHistory(req);
  const prompt = promptFor(req);

  try {
    const { value, debug } = await callGemini(prompt, req.task, userContent(req, prompt));
    const isScene = req.task === "startCampaign" || req.task === "playTurn";
    const data = (isScene ? normalizeScene(value) : value) as Json;

    if (req.persist && req.campaignId) await persistScene(req, data);

    return {
      ok: true,
      task: req.task,
      data,
      durationMs: debug.durationMs,
      ...(req.debug ? { debug } : {}),
    };
  } catch (error) {
    const e = error as EngineError;
    console.error(`[gemini-engine] ${req.task}:`, e.message);
    return {
      ok: false,
      task: req.task,
      data: null,
      errorCode: e.code ?? "ai_error",
      errorMessage: e.message,
      durationMs: Date.now() - startedAt,
      ...(req.debug
        ? {
            debug:
              e.debug ?? {
                task: req.task,
                model: MODEL,
                prompt,
                raw: "",
                durationMs: Date.now() - startedAt,
                error: e.message,
              },
          }
        : {}),
    };
  }
}

/** Injecte les dernières scènes dans le contexte pour garder la continuité. */
async function attachHistory(req: AIRequest) {
  if (!req.campaignId) return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("messages")
      .select("role, content, metadata")
      .eq("campaign_id", req.campaignId)
      .order("created_at", { ascending: false })
      .limit(12);
    const timeline = (data ?? []).reverse().map((m) => ({
      role: m.role,
      content: m.content,
    }));
    req.context = { ...(req.context ?? {}), worldTimeline: timeline as Json };
  } catch (e) {
    console.error("[gemini-engine] history failed:", (e as Error).message);
  }
}

/** Persistance de la réponse IA dans Supabase — n'interrompt jamais la campagne. */
async function persistScene(req: AIRequest, data: unknown) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const scene = data as SceneResponse;
    await supabaseAdmin.from("messages").insert({
      campaign_id: req.campaignId!,
      user_id: null,
      role: "gm",
      content: typeof scene?.narration === "string" ? scene.narration : JSON.stringify(data),
      metadata: { task: req.task, ...(data as Record<string, unknown>) } as never,
    });
  } catch (e) {
    console.error("[gemini-engine] persist failed:", (e as Error).message);
  }
}
