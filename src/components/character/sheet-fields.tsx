import type { ReactNode } from "react";
import { Plus, X } from "lucide-react";
import type { Attribute } from "@/lib/character-sheet";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      {hint && <span className="-mt-1 text-[11px] text-muted-foreground/80">{hint}</span>}
      {children}
    </label>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <Field label={label}>
      <input
        className="rpg-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? ""}
      />
    </Field>
  );
}

export function AreaField({
  label,
  value,
  onChange,
  placeholder,
  rows = 4,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <Field label={label}>
      <textarea
        className="rpg-input resize-none"
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? ""}
      />
    </Field>
  );
}

/** Liste éditable de chaînes (compétences, inventaire). */
export function ListEditor({
  label,
  items,
  onChange,
  placeholder,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            className="rpg-input min-w-0 flex-1"
            value={item}
            placeholder={placeholder ?? ""}
            onChange={(e) => onChange(items.map((v, j) => (j === i ? e.target.value : v)))}
          />
          <button
            type="button"
            aria-label="Supprimer"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            className="shrink-0 rounded-xl border border-rpg/30 bg-card p-2 text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, ""])}
        className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-rpg/40 px-3 py-2 text-xs tracking-wide text-rpg"
      >
        <Plus className="h-4 w-4" /> Ajouter
      </button>
    </div>
  );
}

/** Liste éditable de caractéristiques nom/valeur. */
export function AttributeEditor({
  items,
  onChange,
}: {
  items: Attribute[];
  onChange: (items: Attribute[]) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">Attributs</span>
      {items.map((attr, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,1fr)_5rem_auto] items-center gap-2">
          <input
            className="rpg-input min-w-0"
            value={attr.name}
            placeholder="Force"
            onChange={(e) => onChange(items.map((a, j) => (j === i ? { ...a, name: e.target.value } : a)))}
          />
          <input
            className="rpg-input min-w-0"
            value={attr.value}
            placeholder="12"
            onChange={(e) => onChange(items.map((a, j) => (j === i ? { ...a, value: e.target.value } : a)))}
          />
          <button
            type="button"
            aria-label="Supprimer"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            className="shrink-0 rounded-xl border border-rpg/30 bg-card p-2 text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, { name: "", value: "" }])}
        className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-rpg/40 px-3 py-2 text-xs tracking-wide text-rpg"
      >
        <Plus className="h-4 w-4" /> Ajouter un attribut
      </button>
    </div>
  );
}
