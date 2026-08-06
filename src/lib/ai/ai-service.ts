import { geminiEngine } from "./gemini-engine.functions";
import { isAIDebugEnabled } from "./debug";
import type { AIRequest, AIResult, AIWorldContext, CampaignSeed, CharacterBrief, SceneResponse } from "./types";

type Options = { context?: AIWorldContext; debug?: boolean };

async function run<T extends import("./types").Json = import("./types").Json>(req: AIRequest): Promise<AIResult<T>> {
  try {
    return (await geminiEngine({
      data: { debug: isAIDebugEnabled(), ...req },
    })) as AIResult<T>;
  } catch (error) {
    // Panne réseau / serveur : on renvoie le même contrat, la campagne ne casse pas.
    return {
      ok: false,
      task: req.task,
      data: null,
      errorCode: "ai_unavailable",
      errorMessage:
        error instanceof Error ? error.message : "Impossible de joindre le MJ IA.",
      durationMs: 0,
    };
  }
}

/**
 * AIService — SEUL point d'entrée applicatif vers Gemini.
 * Toutes les méthodes partagent le même contrat AIResult et acceptent déjà
 * les blocs de contexte des phases futures (world state, clocks, registries...).
 */
export const AIService = {
  createCampaign: (seed: CampaignSeed, o: Options = {}) =>
    run({ task: "createCampaign", context: { campaignSeed: seed, ...o.context }, ...o }),

  startCampaign: (
    args: {
      campaignId: string;
      seed: CampaignSeed;
      characters: CharacterBrief[];
      roster?: { id: string; name: string; role: string }[];
    },
    o: Options = {},
  ) =>
    run<SceneResponse>({
      task: "startCampaign",
      campaignId: args.campaignId,
      payload: { characters: args.characters, roster: args.roster ?? [] },
      context: { campaignSeed: args.seed, ...o.context },
      persist: true,
      ...o,
    }),

  playTurn: (
    args: {
      campaignId: string;
      intent: import("./types").Json;
      roster?: { id: string; name: string; role: string }[];
    },
    o: Options = {},
  ) =>
    run<SceneResponse>({
      task: "playTurn",
      campaignId: args.campaignId,
      payload: { roster: args.roster ?? [] },
      context: { playerIntent: args.intent, ...o.context },
      persist: true,
      ...o,
    }),

  generateCharacter: (
    args: { campaignId?: string; description?: string; seed?: CampaignSeed },
    o: Options = {},
  ) =>
    run({
      task: "generateCharacter",
      campaignId: args.campaignId,
      payload: { description: args.description ?? "" },
      context: { ...(args.seed ? { campaignSeed: args.seed } : {}), ...o.context },
    }),

  importCharacter: (
    args: {
      campaignId?: string;
      documentText?: string;
      attachments?: { name: string; mimeType: string; dataUrl: string }[];
      seed?: CampaignSeed;
    },
    o: Options = {},
  ) =>
    run({
      task: "importCharacter",
      campaignId: args.campaignId,
      payload: { documentText: args.documentText ?? "" },
      ...(args.attachments ? { attachments: args.attachments } : {}),
      context: { ...(args.seed ? { campaignSeed: args.seed } : {}), ...o.context },
    }),

  generatePortrait: (args: { characterId?: string; prompt?: string }, o: Options = {}) =>
    run<{ image_url: string | null; image_prompt: string }>({
      task: "generatePortrait",
      payload: { ...args },
      ...o,
    }),

  generateSceneImage: (args: { campaignId?: string; prompt?: string }, o: Options = {}) =>
    run<{ image_url: string | null; image_prompt: string }>({
      task: "generateSceneImage",
      campaignId: args.campaignId,
      payload: { ...args },
      ...o,
    }),

  generateMusic: (args: { query?: string }, o: Options = {}) =>
    run<{ music_url: string | null; music_query: string }>({
      task: "generateMusic",
      payload: { ...args },
      ...o,
    }),

  summarizeCampaign: (args: { campaignId: string }, o: Options = {}) =>
    run({ task: "summarizeCampaign", campaignId: args.campaignId, ...o }),

  generateNpc: (args: { campaignId?: string; brief?: string }, o: Options = {}) =>
    run({ task: "generateNpc", campaignId: args.campaignId, payload: { ...args }, ...o }),

  generateLocation: (args: { campaignId?: string; brief?: string }, o: Options = {}) =>
    run({ task: "generateLocation", campaignId: args.campaignId, payload: { ...args }, ...o }),

  generateQuest: (args: { campaignId?: string; brief?: string }, o: Options = {}) =>
    run({ task: "generateQuest", campaignId: args.campaignId, payload: { ...args }, ...o }),
};
