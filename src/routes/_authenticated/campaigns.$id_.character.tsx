import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileUp,
  PenLine,
  Sparkles,
  Upload,
  Wand2,
} from "lucide-react";
import { MobileShell } from "@/components/mobile-shell";

export const Route = createFileRoute("/_authenticated/campaigns/$id/character")({
  head: () => ({
    meta: [
      { title: "Campfire — Création de personnage" },
      {
        name: "description",
        content:
          "Créez votre personnage Campfire : manuellement, par import, ou avec l'aide de l'IA.",
      },
      { property: "og:title", content: "Campfire — Création de personnage" },
      {
        property: "og:description",
        content: "Quatre façons de créer votre personnage dans Campfire.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CharacterCreationPage,
});

type Method = "manual" | "import" | "ai" | "surprise";

const METHODS: {
  id: Method;
  icon: typeof PenLine;
  title: string;
  text: string;
  desc: string;
}[] = [
  {
    id: "manual",
    icon: PenLine,
    title: "Création manuelle",
    text: "Créer entièrement mon personnage.",
    desc: "Un assistant pas à pas. Vous pourrez compléter la fiche plus tard.",
  },
  {
    id: "import",
    icon: FileUp,
    title: "Importer une fiche",
    text: "Importer un personnage déjà créé.",
    desc: "PDF, DOCX, image ou JSON. L'analyse automatique arrivera bientôt.",
  },
  {
    id: "ai",
    icon: Sparkles,
    title: "Génération assistée",
    text: "Décris ton personnage, Campfire construit la fiche.",
    desc: "Quelques phrases suffisent pour esquisser un héros complet.",
  },
  {
    id: "surprise",
    icon: Wand2,
    title: "Surprends-moi",
    text: "L'IA crée un personnage parfaitement intégré à cette campagne.",
    desc: "Univers, factions et contexte actuel sont pris en compte.",
  },
];

function CharacterCreationPage() {
  const { id } = useParams({ from: "/_authenticated/campaigns/$id/character" });
  const [method, setMethod] = useState<Method | null>(null);

  return (
    <MobileShell>
      <header className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 pb-6">
        {method ? (
          <button
            type="button"
            onClick={() => setMethod(null)}
            className="shrink-0 rounded-full border border-rpg/30 bg-card p-2 text-rpg"
            aria-label="Retour aux méthodes"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        ) : (
          <Link
            to="/campaigns/$id"
            params={{ id }}
            className="shrink-0 rounded-full border border-rpg/30 bg-card p-2 text-rpg"
            aria-label="Retour à la campagne"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
        )}
        <h1 className="truncate font-display text-xl font-bold tracking-wide text-foreground">
          Mon personnage
        </h1>
      </header>

      {method === null && <MethodPicker onPick={setMethod} />}
      {method === "manual" && <ManualWizard />}
      {method === "import" && <ImportPanel />}
      {method === "ai" && <AiPanel />}
      {method === "surprise" && <SurprisePanel />}
    </MobileShell>
  );
}

function MethodPicker({ onPick }: { onPick: (m: Method) => void }) {
  return (
    <section className="flex flex-1 flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Choisissez comment donner vie à votre personnage. Rien n'est définitif : vous
        pourrez tout modifier plus tard.
      </p>
      <ul className="flex flex-col gap-3">
        {METHODS.map((m) => {
          const Icon = m.icon;
          return (
            <li key={m.id}>
              <article className="relative overflow-hidden rounded-2xl border border-rpg/30 bg-card p-4">
                <div className="flex items-start gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-rpg/30 bg-secondary text-rpg">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-display text-lg tracking-wide text-foreground">
                      {m.title}
                    </h2>
                    <p className="mt-1 text-sm text-foreground/90">{m.text}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{m.desc}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onPick(m.id)}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-rpg/40 bg-secondary px-4 py-3 font-display tracking-wide text-foreground transition-colors active:scale-[0.99] hover:border-rpg"
                >
                  Continuer
                  <ArrowRight className="h-4 w-4 text-rpg" />
                </button>
              </article>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const STEPS = ["Identité", "Apparence", "Histoire", "Aptitudes"] as const;

function ManualWizard() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    name: "",
    archetype: "",
    age: "",
    appearance: "",
    traits: "",
    background: "",
    motivation: "",
    skills: "",
    equipment: "",
  });
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <section className="flex flex-1 flex-col gap-5">
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex min-w-0 flex-1 flex-col gap-1">
            <div
              className={`h-1 rounded-full ${i <= step ? "bg-rpg" : "bg-secondary"}`}
              aria-hidden
            />
            <span
              className={`truncate text-[10px] uppercase tracking-wider ${
                i === step ? "text-rpg" : "text-muted-foreground"
              }`}
            >
              {s}
            </span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        {step === 0 && (
          <>
            <Field label="Nom du personnage">
              <input
                className="rpg-input"
                value={form.name}
                onChange={(e) => set("name")(e.target.value)}
                placeholder="Ex. Ysolde de Farren"
              />
            </Field>
            <Field label="Archétype / rôle">
              <input
                className="rpg-input"
                value={form.archetype}
                onChange={(e) => set("archetype")(e.target.value)}
                placeholder="Ex. mercenaire, érudite, pilote…"
              />
            </Field>
            <Field label="Âge">
              <input
                className="rpg-input"
                value={form.age}
                onChange={(e) => set("age")(e.target.value)}
                placeholder="Optionnel"
              />
            </Field>
          </>
        )}
        {step === 1 && (
          <>
            <Field label="Apparence">
              <textarea
                className="rpg-input min-h-28 resize-none"
                value={form.appearance}
                onChange={(e) => set("appearance")(e.target.value)}
                placeholder="Silhouette, regard, cicatrices, style…"
              />
            </Field>
            <Field label="Traits de caractère">
              <textarea
                className="rpg-input min-h-24 resize-none"
                value={form.traits}
                onChange={(e) => set("traits")(e.target.value)}
                placeholder="Calme, sarcastique, loyal…"
              />
            </Field>
          </>
        )}
        {step === 2 && (
          <>
            <Field label="Historique">
              <textarea
                className="rpg-input min-h-32 resize-none"
                value={form.background}
                onChange={(e) => set("background")(e.target.value)}
                placeholder="D'où vient-il ? Que fuit-il ?"
              />
            </Field>
            <Field label="Motivation">
              <textarea
                className="rpg-input min-h-24 resize-none"
                value={form.motivation}
                onChange={(e) => set("motivation")(e.target.value)}
                placeholder="Ce qui le pousse à avancer"
              />
            </Field>
          </>
        )}
        {step === 3 && (
          <>
            <Field label="Compétences">
              <textarea
                className="rpg-input min-h-24 resize-none"
                value={form.skills}
                onChange={(e) => set("skills")(e.target.value)}
                placeholder="Une par ligne"
              />
            </Field>
            <Field label="Équipement">
              <textarea
                className="rpg-input min-h-24 resize-none"
                value={form.equipment}
                onChange={(e) => set("equipment")(e.target.value)}
                placeholder="Une ligne par objet"
              />
            </Field>
          </>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Tous les champs sont facultatifs : vous pourrez compléter la fiche plus tard.
      </p>

      <div className="mt-auto flex gap-3 pt-4">
        {step > 0 && (
          <button
            type="button"
            onClick={() => setStep((s) => s - 1)}
            className="flex-1 rounded-xl border border-rpg/30 bg-card px-4 py-3 font-display tracking-wide text-foreground"
          >
            Précédent
          </button>
        )}
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={() => setStep((s) => s + 1)}
            className="flex-1 rounded-xl border border-rpg/40 bg-secondary px-4 py-3 font-display tracking-wide text-foreground"
          >
            Suivant
          </button>
        ) : (
          <button type="button" className="flex-1 rpg-button py-4 text-base">
            <Check className="h-5 w-5 shrink-0 text-rpg" />
            <span className="font-display tracking-wide">Terminer plus tard</span>
          </button>
        )}
      </div>
    </section>
  );
}

function ImportPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);

  return (
    <section className="flex flex-1 flex-col gap-4">
      <PanelHeader
        icon={FileUp}
        title="Importer une fiche"
        text="Importer un personnage déjà créé."
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-rpg/40 bg-card/60 px-6 py-10 text-center"
      >
        <Upload className="h-7 w-7 text-rpg" />
        <span className="font-display tracking-wide text-foreground">
          Choisir un fichier
        </span>
        <span className="text-xs text-muted-foreground">PDF, DOCX, image ou JSON</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,.json,image/*"
        className="hidden"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      {file && (
        <div className="rounded-2xl border border-rpg/30 bg-card p-4">
          <p className="truncate font-display tracking-wide text-foreground">{file.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {(file.size / 1024).toFixed(0)} Ko — prêt pour l'analyse
          </p>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        L'analyse automatique du document par l'IA arrivera dans une prochaine version.
      </p>
      <button type="button" disabled className="mt-auto rpg-button py-4 opacity-50">
        <Sparkles className="h-5 w-5 shrink-0 text-rpg" />
        <span className="font-display tracking-wide">Analyser la fiche (bientôt)</span>
      </button>
    </section>
  );
}

function AiPanel() {
  const [text, setText] = useState("");
  return (
    <section className="flex flex-1 flex-col gap-4">
      <PanelHeader
        icon={Sparkles}
        title="Génération assistée"
        text="Décris ton personnage, Campfire construit la fiche."
      />
      <textarea
        className="rpg-input min-h-44 resize-none"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Ancien chevalier devenu mercenaire. Protecteur, calme, mais rongé par la culpabilité."
      />
      <ul className="flex flex-wrap gap-2">
        {["Caractéristiques", "Compétences", "Portrait", "Traits", "Motivation", "Historique"].map(
          (t) => (
            <li
              key={t}
              className="rounded-full border border-rpg/30 px-3 py-1 text-[11px] uppercase tracking-wider text-muted-foreground"
            >
              {t}
            </li>
          ),
        )}
      </ul>
      <button type="button" disabled className="mt-auto rpg-button py-4 opacity-50">
        <Sparkles className="h-5 w-5 shrink-0 text-rpg" />
        <span className="font-display tracking-wide">Générer la fiche (bientôt)</span>
      </button>
    </section>
  );
}

function SurprisePanel() {
  return (
    <section className="flex flex-1 flex-col gap-4">
      <PanelHeader
        icon={Wand2}
        title="Surprends-moi"
        text="L'IA crée un personnage parfaitement intégré à cette campagne."
      />
      <ul className="flex flex-col gap-2">
        {[
          "Type de campagne",
          "Description de l'univers",
          "Monde généré",
          "Factions",
          "Contexte actuel",
        ].map((t) => (
          <li
            key={t}
            className="flex items-center gap-3 rounded-2xl border border-rpg/20 bg-card/70 px-4 py-3 text-sm text-foreground"
          >
            <Check className="h-4 w-4 shrink-0 text-rpg" />
            {t}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Campfire s'appuiera sur ces éléments pour créer un personnage cohérent avec votre
        univers.
      </p>
      <button type="button" disabled className="mt-auto rpg-button py-4 opacity-50">
        <Wand2 className="h-5 w-5 shrink-0 text-rpg" />
        <span className="font-display tracking-wide">Créer mon personnage (bientôt)</span>
      </button>
    </section>
  );
}

function PanelHeader({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof PenLine;
  title: string;
  text: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-rpg/30 bg-secondary text-rpg">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <h2 className="font-display text-lg tracking-wide text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground">{text}</p>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}