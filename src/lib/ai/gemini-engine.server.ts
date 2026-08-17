/**
 * gemini-engine — point unique d'appel à Gemini (serveur uniquement).
 * Aucune clé d'API n'existe côté navigateur : elle est lue ici, à l'exécution.
 */
import type { AIDebugInfo, AIRequest, AIResult, AITask, Json, SceneResponse } from "./types";
import { SHEET_JSON_CONTRACT } from "@/lib/character-sheet";

/** API Gemini Developer (Google AI Studio) — clé du projet du propriétaire. */
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL = "gemini-flash-latest";
/** Modèles essayés dans l'ordre : le premier sain répond. */
const MODEL_CHAIN = ["gemini-3.5-flash", "gemini-2.5-flash", "gemini-flash-latest"];
const IMAGE_MODEL = "gemini-2.5-flash-image";

type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

/** Transforme le contenu interne (texte ou parts OpenAI-like) en parts Gemini. */
function toGeminiParts(content: unknown): GeminiPart[] {
  if (typeof content === "string") return [{ text: content }];
  if (!Array.isArray(content)) return [{ text: String(content ?? "") }];
  const parts: GeminiPart[] = [];
  for (const item of content as Record<string, unknown>[]) {
    if (item?.["type"] === "text") {
      parts.push({ text: String(item["text"] ?? "") });
      continue;
    }
    const url = ((item?.["image_url"] as Record<string, unknown>)?.["url"] ?? "") as string;
    const match = /^data:([^;]+);base64,(.+)$/.exec(url);
    if (match) parts.push({ inline_data: { mime_type: match[1]!, data: match[2]! } });
  }
  return parts.length ? parts : [{ text: "" }];
}

function geminiUrl(model: string, apiKey: string): string {
  return `${GEMINI_API_BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
}

/** Ne jamais laisser fuiter la clé dans les logs ou les messages d'erreur. */
function scrub(text: string, apiKey: string): string {
  return apiKey ? text.split(apiKey).join("***") : text;
}

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

/** Bloc de combat structuré produit par Gemini (appliqué par Campfire). */
function parseCombat(value: unknown): SceneResponse["combat"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const status = String(v["status"] ?? "").toLowerCase();
  const enemies = Array.isArray(v["enemies"])
    ? (v["enemies"] as unknown[])
        .map((e) => {
          const o = (e ?? {}) as Record<string, unknown>;
          const maxHp = Math.max(1, Math.min(999, Number(o["max_hp"] ?? 10) || 10));
          const hp = Math.max(0, Math.min(maxHp, Number(o["hp"] ?? maxHp)));
          return {
            name: String(o["name"] ?? "").trim(),
            level: Math.max(1, Math.min(30, Number(o["level"] ?? 1) || 1)),
            max_hp: maxHp,
            hp,
            status: String(o["status"] ?? "").trim(),
          };
        })
        .filter((e) => e.name)
        .slice(0, 8)
    : [];
  return {
    active: v["active"] === undefined ? enemies.length > 0 : Boolean(v["active"]),
    status: (COMBAT_STATUSES.has(status) ? status : "active") as NonNullable<
      SceneResponse["combat"]
    >["status"],
    round: Math.max(1, Math.min(99, Number(v["round"] ?? 1) || 1)),
    enemies,
  };
}

const COMBAT_STATUSES = new Set(["active", "victory", "defeat", "flight", "interrupted"]);

const SCENE_JSON_CONTRACT =
  '{"scene_title":string,"narration":string,"scene_mood":string,"location":string,"world_time":string,' +
  '"weather":string,"tension":number,"image_prompt":string,' +
  '"combat":{"active":boolean,"status":"active"|"victory"|"defeat"|"flight"|"interrupted","round":number,"enemies":[{"name":string,"level":number,"max_hp":number,"hp":number,"status":string}]}|null,' +
  '"dialogues":[{"speaker":string,"line":string}],' +
  '"dice_request":{"formula":string,"threshold":number,"reason":string,"ability":string}|null,' +
  '"scene_state":"NARRATION"|"PLAYER_TURN"|"GROUP_CHOICE"|"COMBAT"|"DIALOGUE",' +
  '"active_players":[string],"initiative":[string],"waiting_for_input":boolean,' +
  '"allow_parallel_inputs":boolean,"requires_mj_confirmation":boolean,' +
  '"read_aloud":string,"gm_notes":string,"gm_secrets":[string],"offscreen_events":[string],' +
  '"world_update":{"time":{"day":number,"time_of_day":string,"weather":string,"location":string},' +
  '"events":[{"summary":string,"importance":"major"|"minor","visibility":"public"|"gm"|"private","user_id":string}],' +
  '"world_events":[{"summary":string,"importance":"major"|"minor","visibility":"public"|"gm"}],' +
  '"npcs":[{"name":string,"role":string,"faction":string,"personality":string,"speech_style":string,"appearance":string,"status":string,"location":string,"alive":boolean,"secret":string}],' +
  '"relations":[{"npc":string,"user_id":string,"trust":number,"suspicion":number,"hostility":number,"opinion":string,"reason":string}],' +
  '"locations":[{"name":string,"summary":string,"visibility":"public"|"gm"|"private","user_id":string}],' +
  '"factions":[{"name":string,"summary":string,"stance":string}],' +
  '"quests":[{"name":string,"status":string,"summary":string}],' +
  '"reputation":[{"scope":string,"summary":string,"user_id":string}],' +
  '"conditions":[{"user_id":string,"label":string,"severity":"legere"|"serieuse"|"grave","healed":boolean}]},' +
  '"suggested_actions":[string,string,string]}';

const SCENE_RULES = [
  "Règles de rédaction :",
  "- narration : 100 à 180 mots, phrases courtes, langage parlé mais soigné, au présent.",
  "- dialogues : 0 à 2 répliques maximum, uniquement si un personnage parle vraiment. Sinon tableau vide.",
  "- tension : entier de 0 à 100.",
  "- location, world_time (ex: \"Jour 3 — 17h20\"), weather : toujours renseignés, en français.",
  "- image_prompt en anglais.",
  "- suggested_actions : 3 ou 4 actions courtes, concrètes, à la 2e personne.",
  "  Si une action proposée nécessite un jet de dé, termine-la par la caractéristique et son modificateur entre parenthèses,",
  "  ex : \"Forcer la porte (Force, +2)\", \"Convaincre le garde (Charisme, -1)\", \"Sauter le fossé (Dextérité, aucun modificateur)\".",
  "- dice_request : uniquement si l'action demande un test incertain, sinon null. threshold entier.",
  "  formula inclut TOUJOURS le modificateur appliqué : \"1d20+2\", \"1d20-1\" ou \"1d20\" si aucun.",
  "  ability : le nom en français de la caractéristique testée (Force, Dextérité, Intelligence, Charisme...).",
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
  "Combat (obligatoire dès qu'un affrontement est en cours) :",
  "- combat : null hors combat. En combat, renvoie l'état complet et à jour.",
  "- enemies : la liste COMPLÈTE des ennemis présents, avec name, level, max_hp, hp et status court",
  "  (ex : \"En pleine forme\", \"Blessé\", \"À terre\"). Réutilise EXACTEMENT les mêmes noms d'un tour à l'autre.",
  "- Quand le combat se termine, renvoie status victory, defeat, flight ou interrupted et active=false.",
  "- Pendant un combat, scene_state doit valoir COMBAT.",
  "",
  "Bloc MJ (jamais montré aux joueurs) :",
  "- read_aloud : court texte que le MJ peut lire à voix haute aux joueurs.",
  "- gm_notes : ce que le MJ doit savoir (intentions des PNJ, pièges, rythme).",
  "- gm_secrets : 0 à 3 secrets non encore révélés.",
  "- offscreen_events : 0 à 3 événements qui se déroulent hors champ.",
  "",
  "Mémoire du monde (bloc world_update, obligatoire à chaque scène) :",
  "- Le monde existe sans les joueurs. Il se souvient, il vieillit, il continue de tourner.",
  "- Utilise le contexte fourni (état du monde, PNJ, relations, factions, quêtes) comme VÉRITÉ ÉTABLIE.",
  "  Ne contredis jamais un fait déjà enregistré ; fais-le évoluer.",
  "- time : fais avancer le temps de façon crédible (jamais en arrière). Change le moment de la journée et la météo quand c'est logique.",
  "- events : 0 à 3 faits marquants de CETTE scène, en une phrase. visibility=public par défaut,",
  "  gm si les joueurs l'ignorent, private (avec user_id) si un seul personnage l'a perçu.",
  "- world_events : 0 à 2 choses qui se produisent ailleurs, sans les joueurs (une faction avance, une rumeur circule,",
  "  un lieu change). Elles doivent finir par se voir plus tard.",
  "- npcs : chaque PNJ qui apparaît. Garde EXACTEMENT le même nom, le même caractère et la même façon de parler",
  "  d'une scène à l'autre. secret = ce que le PNJ cache (réservé au MJ). alive=false s'il meurt.",
  "- relations : variations de -25 à +25 seulement, jamais de bascule brutale. user_id du joueur concerné,",
  "  ou \"party\" pour le groupe. reason = la raison en une phrase. Un PNJ trahi devient méfiant, pas amnésique.",
  "- locations, factions, quests, reputation : mets à jour ce qui a changé, réutilise les noms existants.",
  "- conditions : blessures ou séquelles narratives durables d'un personnage (user_id obligatoire).",
  "  healed=true quand la séquelle disparaît.",
  "",
  "Perception (très important) :",
  "- Un personnage ne sait que ce qu'il a vu, entendu ou appris. Ne révèle jamais dans la narration",
  "  un secret que les personnages ignorent : il reste dans gm_secrets ou en visibility gm.",
  "- Adapte ce qui est remarqué au personnage : un guerrier repère une posture de combat, un voleur une serrure",
  "  ou une bourse, un érudit un symbole, un soigneur une blessure. Décris ces détails pour le personnage concerné.",
  "- Si des personnages n'ont pas la même information, dis-le côté MJ plutôt que de tout dévoiler à tous.",
  "- Un temps long qui passe a des conséquences : blessures qui guérissent ou s'aggravent, PNJ qui bougent,",
  "  plans ennemis qui avancent.",
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
          ...inspirationLines(seed),
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
          ...campaignBrief(req),
          `Joueurs de la table (utilise ces identifiants) : ${JSON.stringify(roster)}`,
          advance
            ? "Le MJ humain demande ADVANCE_SCENE : laisse simplement la scène évoluer naturellement, sans forcer d'événement majeur."
            : "Voici ce que fait le joueur :",
          `Personnage : ${String(intent?.["character"] ?? "Un joueur")}`,
          `Identifiant du joueur : ${String(intent?.["user_id"] ?? "inconnu")}`,
          `Action : ${String(intent?.["text"] ?? "")}`,
          `Niveau du personnage : ${String(intent?.["level"] ?? "1")}`,
          intent?.["target"] ? `Cible visée : ${JSON.stringify(intent["target"])}` : "",
          intent?.["combat"]
            ? `État du combat en cours (source de vérité de Campfire) : ${JSON.stringify(intent["combat"])}. Repars de ces PV et de ces noms.`
            : "",
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

/**
 * Bloc « inspirations » : références créatives du MJ.
 * Ce ne sont JAMAIS des œuvres à copier, seulement une direction artistique.
 */
function inspirationLines(seed: { inspiration?: string | null } | undefined): string[] {
  const value = seed?.inspiration?.trim();
  if (!value) return [];
  return [
    `Inspirations citées par le MJ : ${value}`,
    "Ces inspirations sont des RÉFÉRENCES CRÉATIVES, pas des œuvres à copier :",
    "- n'utilise aucun nom propre, personnage, lieu ou marque venant de ces œuvres ;",
    "- fusionne intelligemment leurs influences (ambiance, ton, style du monde, factions,",
    "  types de conflits, créatures, technologie, magie, rythme, thèmes) en un univers original et cohérent ;",
    "- la description du MJ reste PRIORITAIRE : l'inspiration ne fait que l'enrichir et l'orienter.",
  ];
}

function campaignBrief(req: AIRequest): string[] {
  const seed = req.context?.campaignSeed;
  return [
    `Campagne : ${seed?.name ?? "Sans nom"}`,
    `Type / ton : ${seed?.type ?? "Libre"}`,
    `Univers : ${seed?.universe ?? "Non précisé"}`,
    ...inspirationLines(seed),
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Délais entre tentatives (ms) — court, puis plus long. */
const RETRY_DELAYS = [1500, 4000];

async function callGemini(
  prompt: string,
  task: AITask,
  content: unknown = prompt,
): Promise<{ value: unknown; debug: AIDebugInfo }> {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) {
    const err: EngineError = new Error("Service IA non configuré côté serveur.");
    err.code = "ai_unavailable";
    throw err;
  }

  let lastError: EngineError | null = null;
  /** Erreur la plus parlante pour l'utilisateur (surcharge / quota), à privilégier. */
  let meaningfulError: EngineError | null = null;

  for (const model of MODEL_CHAIN) {
    for (let attempt = 0; attempt < RETRY_DELAYS.length + 1; attempt++) {
      try {
        return await callOnce(model, apiKey, prompt, task, content);
      } catch (e) {
        const err = e as EngineError;
        lastError = err;
        if (err.code === "ai_rate_limited" || err.code === "ai_overloaded") {
          meaningfulError ??= err;
        }
        // Erreurs définitives : inutile d'insister.
        if (err.code === "ai_unauthorized" || err.code === "ai_bad_request") throw err;
        if (err.code === "ai_bad_json") throw err;
        // Modèle inconnu côté Google : on passe directement au suivant.
        if (err.code === "ai_model_missing") break;
        const delay = RETRY_DELAYS[attempt];
        if (delay === undefined) break; // on passe au modèle suivant
        await sleep(delay);
      }
    }
  }

  throw meaningfulError ?? lastError ?? new Error("Service IA indisponible.");
}

async function callOnce(
  model: string,
  apiKey: string,
  prompt: string,
  task: AITask,
  content: unknown,
): Promise<{ value: unknown; debug: AIDebugInfo }> {
  const startedAt = Date.now();
  const response = await fetch(geminiUrl(model, apiKey), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: toGeminiParts(content) }],
      generationConfig: { responseMimeType: "application/json" },
    }),
  });

  const bodyText = scrub(await response.text(), apiKey);
  const durationMs = Date.now() - startedAt;

  if (!response.ok) {
    console.error(`[gemini-engine] ${task} (${model}) failed [${response.status}]`);
    const err: EngineError = new Error(
      response.status === 429
        ? "Le MJ IA est momentanément saturé. Réessayez dans quelques instants."
        : response.status === 401 || response.status === 403
          ? "Clé Gemini invalide ou sans accès à ce modèle."
          : response.status === 503
            ? "Le MJ IA est temporairement surchargé côté Google. Réessayez dans quelques secondes."
            : `Service IA indisponible (${response.status}).`,
    );
    err.code =
      response.status === 429
        ? "ai_rate_limited"
        : response.status === 401 || response.status === 403
          ? "ai_unauthorized"
          : response.status === 400
            ? "ai_bad_request"
            : response.status === 404
              ? "ai_model_missing"
              : response.status === 503
                ? "ai_overloaded"
                : "ai_unavailable";
    err.debug = { task, model, prompt, raw: bodyText, durationMs, error: `HTTP ${response.status}` };
    throw err;
  }

  const json = JSON.parse(bodyText) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const raw = (json.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("");
  const debug: AIDebugInfo = { task, model, prompt, raw, durationMs };

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

const SCENE_STATES = new Set(["NARRATION", "PLAYER_TURN", "GROUP_CHOICE", "COMBAT", "DIALOGUE"]);

function strList(value: unknown, max = 8): string[] {
  return Array.isArray(value)
    ? (value as unknown[]).map((v) => String(v).trim()).filter(Boolean).slice(0, max)
    : [];
}

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
  const state = String(v["scene_state"] ?? "").toUpperCase();
  const sceneState = (SCENE_STATES.has(state) ? state : "NARRATION") as SceneResponse["scene_state"];
  const activePlayers = strList(v["active_players"], 12);
  return {
    scene_title: String(v["scene_title"] ?? "Ouverture"),
    narration: String(v["narration"] ?? ""),
    scene_mood: String(v["scene_mood"] ?? ""),
    combat: parseCombat(v["combat"]),
    image_prompt: String(v["image_prompt"] ?? ""),
    suggested_actions: actions,
    location: String(v["location"] ?? ""),
    world_time: String(v["world_time"] ?? ""),
    weather: String(v["weather"] ?? ""),
    tension: Math.max(0, Math.min(100, Number(v["tension"] ?? 20) || 0)),
    dialogues,
    dice_request: diceRequest,
    scene_state: sceneState,
    active_players: activePlayers,
    initiative: strList(v["initiative"], 12),
    waiting_for_input:
      typeof v["waiting_for_input"] === "boolean"
        ? (v["waiting_for_input"] as boolean)
        : activePlayers.length > 0,
    allow_parallel_inputs:
      typeof v["allow_parallel_inputs"] === "boolean"
        ? (v["allow_parallel_inputs"] as boolean)
        : sceneState === "GROUP_CHOICE",
    requires_mj_confirmation:
      typeof v["requires_mj_confirmation"] === "boolean"
        ? (v["requires_mj_confirmation"] as boolean)
        : activePlayers.length === 0,
    read_aloud: String(v["read_aloud"] ?? ""),
    gm_notes: String(v["gm_notes"] ?? ""),
    gm_secrets: strList(v["gm_secrets"], 5),
    offscreen_events: strList(v["offscreen_events"], 5),
    world_update:
      v["world_update"] && typeof v["world_update"] === "object" && !Array.isArray(v["world_update"])
        ? (v["world_update"] as Json)
        : null,
  };
}

/* ------------------------------------------------------------------- images */

const IMAGE_TASKS = new Set<AITask>(["generatePortrait", "generateSceneImage"]);

async function generateImage(prompt: string): Promise<string | null> {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) return null;
  const response = await fetch(geminiUrl(IMAGE_MODEL, apiKey), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["IMAGE"] },
    }),
  });
  if (!response.ok) {
    console.error(
      `[gemini-engine] image failed [${response.status}]: ${scrub(await response.text(), apiKey)}`,
    );
    return null;
  }
  const json = (await response.json()) as {
    candidates?: {
      content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] };
    }[];
  };
  const inline = (json.candidates?.[0]?.content?.parts ?? []).find((p) => p.inlineData?.data)
    ?.inlineData;
  return inline?.data ? `data:${inline.mimeType ?? "image/png"};base64,${inline.data}` : null;
}

/* --------------------------------------------------------------- entrypoint */

export async function runGeminiEngine(req: AIRequest): Promise<AIResult> {
  const startedAt = Date.now();

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
  if (req.task === "playTurn" || req.task === "startCampaign") await attachWorld(req);
  const prompt = promptFor(req);

  try {
    const { value, debug } = await callGemini(prompt, req.task, userContent(req, prompt));
    const isScene = req.task === "startCampaign" || req.task === "playTurn";
    const data = (isScene ? normalizeScene(value) : value) as Json;

    if (req.persist && req.campaignId) await persistScene(req, data);
    if (isScene && req.campaignId) await saveWorld(req.campaignId, data);

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

/** Charge la mémoire du monde : ce que la campagne a déjà vécu. */
async function attachWorld(req: AIRequest) {
  if (!req.campaignId) return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { readWorld, worldContextFrom } = await import("@/lib/world/world.server");
    const snap = await readWorld(supabaseAdmin, req.campaignId);
    const world = worldContextFrom(snap);
    req.context = {
      ...(req.context ?? {}),
      canonicalWorldState: world.canonicalWorldState,
      npcRegistry: world.npcRegistry,
      factionRegistry: world.factionRegistry,
      secretKnowledge: world.secretKnowledge,
      activeClocks: world.worldTimeline,
    };
  } catch (e) {
    console.error("[gemini-engine] world context failed:", (e as Error).message);
  }
}

/** Enregistre les conséquences de la scène — jamais bloquant pour la partie. */
async function saveWorld(campaignId: string, data: unknown) {
  const update = (data as SceneResponse | null)?.world_update;
  if (!update) return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { applyWorldUpdate } = await import("@/lib/world/world.server");
    await applyWorldUpdate(supabaseAdmin, campaignId, update);
  } catch (e) {
    console.error("[gemini-engine] world update failed:", (e as Error).message);
  }
}

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
