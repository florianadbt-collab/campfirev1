/**
 * Modèle unique de fiche de personnage Campfire.
 * Les colonnes Supabase existantes sont conservées telles quelles ; les champs
 * additionnels (personnalité, valeurs, défauts, motivation privée) sont
 * sérialisés dans la colonne `notes`.
 */
import type { Json } from "@/lib/ai/types";

export type Attribute = { name: string; value: string };

export interface CharacterSheet {
  name: string;
  portrait_url: string | null;
  race: string;
  class_profession: string;
  level: number;
  physical_description: string;
  backstory: string;
  /** Motivation privée : envoyée au MJ IA, jamais affichée aux autres joueurs. */
  motivation: string;
  traits: string;
  personality: string;
  values: string;
  flaws: string;
  attributes: Attribute[];
  abilities: string[];
  inventory: string[];
}

export const EMPTY_SHEET: CharacterSheet = {
  name: "",
  portrait_url: null,
  race: "",
  class_profession: "",
  level: 1,
  physical_description: "",
  backstory: "",
  motivation: "",
  traits: "",
  personality: "",
  values: "",
  flaws: "",
  attributes: [],
  abilities: [],
  inventory: [],
};

type NotesBlob = Pick<
  CharacterSheet,
  "motivation" | "traits" | "personality" | "values" | "flaws"
>;

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === "string" ? v : typeof v === "object" && v ? String((v as Record<string, unknown>)["name"] ?? "") : String(v)))
    .filter(Boolean);
}

function asAttributes(value: unknown): Attribute[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => {
      if (typeof v === "object" && v) {
        const o = v as Record<string, unknown>;
        return { name: String(o["name"] ?? ""), value: String(o["value"] ?? "") };
      }
      return { name: String(v), value: "" };
    })
    .filter((a) => a.name);
}

/** Ligne Supabase -> fiche. */
export function sheetFromRow(row: Record<string, unknown>): CharacterSheet {
  let notes: Partial<NotesBlob> = {};
  const raw = row["notes"];
  if (typeof raw === "string" && raw.trim().startsWith("{")) {
    try {
      notes = JSON.parse(raw) as Partial<NotesBlob>;
    } catch {
      notes = {};
    }
  }
  return {
    ...EMPTY_SHEET,
    name: String(row["name"] ?? ""),
    portrait_url: (row["portrait_url"] as string | null) ?? null,
    race: String(row["race"] ?? ""),
    class_profession: String(row["class_profession"] ?? ""),
    level: Number(row["level"] ?? 1) || 1,
    physical_description: String(row["physical_description"] ?? ""),
    backstory: String(row["backstory"] ?? ""),
    motivation: notes.motivation ?? "",
    traits: notes.traits ?? "",
    personality: notes.personality ?? "",
    values: notes.values ?? "",
    flaws: notes.flaws ?? "",
    attributes: asAttributes(row["attributes"]),
    abilities: asStringList(row["abilities"]),
    inventory: asStringList(row["inventory"]),
  };
}

/** Fiche -> colonnes Supabase. */
export function sheetToRow(sheet: CharacterSheet) {
  const notes: NotesBlob = {
    motivation: sheet.motivation,
    traits: sheet.traits,
    personality: sheet.personality,
    values: sheet.values,
    flaws: sheet.flaws,
  };
  return {
    name: sheet.name,
    portrait_url: sheet.portrait_url,
    race: sheet.race || null,
    class_profession: sheet.class_profession || null,
    level: sheet.level,
    physical_description: sheet.physical_description || null,
    backstory: sheet.backstory || null,
    attributes: sheet.attributes as unknown as Json,
    abilities: sheet.abilities as unknown as Json,
    inventory: sheet.inventory as unknown as Json,
    notes: JSON.stringify(notes),
  };
}

/** Réponse IA (partielle, jamais inventée) -> fiche complète. */
export function sheetFromAI(value: unknown, base: CharacterSheet = EMPTY_SHEET): CharacterSheet {
  const v = (value ?? {}) as Record<string, unknown>;
  const str = (k: string, fallback: string) =>
    typeof v[k] === "string" && (v[k] as string).trim() ? (v[k] as string).trim() : fallback;
  return {
    ...base,
    name: str("name", base.name),
    race: str("race", base.race),
    class_profession: str("class_profession", base.class_profession),
    level: Number(v["level"] ?? base.level) || base.level,
    physical_description: str("physical_description", base.physical_description),
    backstory: str("backstory", base.backstory),
    motivation: str("motivation", base.motivation),
    traits: str("traits", base.traits),
    personality: str("personality", base.personality),
    values: str("values", base.values),
    flaws: str("flaws", base.flaws),
    attributes: asAttributes(v["attributes"]).length ? asAttributes(v["attributes"]) : base.attributes,
    abilities: asStringList(v["abilities"]).length ? asStringList(v["abilities"]) : base.abilities,
    inventory: asStringList(v["inventory"]).length ? asStringList(v["inventory"]) : base.inventory,
  };
}

export const SHEET_JSON_CONTRACT =
  '{"name":string,"race":string,"class_profession":string,"level":number,"physical_description":string,' +
  '"backstory":string,"motivation":string,"traits":string,"personality":string,"values":string,"flaws":string,' +
  '"attributes":[{"name":string,"value":string}],"abilities":[string],"inventory":[string]}';
