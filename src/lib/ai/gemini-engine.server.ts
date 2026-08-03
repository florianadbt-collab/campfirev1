/**
 * gemini-engine — point unique d'appel à Gemini (serveur uniquement).
 * Aucune clé d'API n'existe côté navigateur : elle est lue ici, à l'exécution.
 */
import type { AIDebugInfo, AIRequest, AIResult, AITask, Json, SceneResponse } from "./types";
import { SHEET_JSON_CONTRACT } from "@/lib/character-sheet";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3.6-flash";

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
  "Tu écris en français, de façon immersive et concise. " +
  "Tu réponds TOUJOURS avec un unique objet JSON valide, sans texte autour, sans balises markdown.";

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
          `Type de campagne : ${seed?.type ?? "Libre"}`,
          `Description de l'univers : ${seed?.universe ?? "Non précisée"}`,
          `Le MJ participe aussi comme joueur : ${seed?.gmPlays ? "oui" : "non"}`,
          `Personnages créés : ${characters.length ? JSON.stringify(characters) : "aucun pour l'instant"}`,
          "",
          "Réponds avec ce JSON exact :",
          '{"scene_title":string,"narration":string,"scene_mood":string,"music_query":string,"image_prompt":string,"suggested_actions":[string,string,string]}',
          "narration : 120 à 200 mots. music_query et image_prompt en anglais.",
        ].join("\n") + suffix
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

/* --------------------------------------------------------------- entrypoint */

function noop() {
  }
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

async function callGemini(prompt: string, task: AITask): Promise<{ value: unknown; debug: AIDebugInfo }> {
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
        { role: "user", content: prompt },
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
  return {
    scene_title: String(v["scene_title"] ?? "Ouverture"),
    narration: String(v["narration"] ?? ""),
    scene_mood: String(v["scene_mood"] ?? ""),
    music_query: String(v["music_query"] ?? ""),
    image_prompt: String(v["image_prompt"] ?? ""),
    suggested_actions: actions,
  };
}

/** Tâches non encore branchées sur un modèle : réponse simulée, contrat définitif. */
const SIMULATED: Partial<Record<AITask, () => Json>> = {
  generatePortrait: () => ({ image_url: null, image_prompt: "portrait placeholder" }),
  generateSceneImage: () => ({ image_url: null, image_prompt: "scene placeholder" }),
  generateMusic: () => ({ music_url: null, music_query: "dark fantasy ambient" }),
};

/* --------------------------------------------------------------- entrypoint */

export async function runGeminiEngine(req: AIRequest): Promise<AIResult> {
  const startedAt = Date.now();

  const simulate = SIMULATED[req.task];
  if (simulate) {
    return { ok: true, task: req.task, data: simulate() as Json, durationMs: Date.now() - startedAt, simulated: true };
  }

  const prompt = buildPrompt(req);

  try {
    const { value, debug } = await callGemini(prompt, req.task);
    const data = (req.task === "startCampaign" ? normalizeScene(value) : value) as Json;

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
