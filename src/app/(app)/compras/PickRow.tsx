import { Check } from "lucide-react";

type Props = {
  name: string;
  selected: boolean;
  onToggle: () => void;
  /** Texto pequeño a la derecha: "En casa", "hace 12 días"… */
  hint?: string;
  /** «warn» resalta el aviso (lo tienes en casa); «muted» es informativo. */
  tone?: "warn" | "muted";
  /** Ya está en la lista: no se puede volver a elegir. */
  disabled?: boolean;
};

/** Fila con check para elegir productos en las hojas de «Voy a comprar». */
export function PickRow({ name, selected, onToggle, hint, tone = "muted", disabled }: Props) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={selected}
      className={`flex min-h-11 w-full items-center gap-3 px-3 py-1.5 text-left transition active:bg-washi-deep ${disabled ? "opacity-50" : ""}`}
    >
      <span
        className={`flex size-5 shrink-0 items-center justify-center rounded-full border ${
          selected ? "border-forest bg-forest text-surface" : "border-line bg-surface"
        }`}
      >
        {selected && <Check size={14} strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1 truncate text-[15px] leading-snug">{name}</span>
      {hint && (
        <span className={`shrink-0 text-xs ${tone === "warn" ? "font-medium text-terracotta" : "text-ink-soft"}`}>{hint}</span>
      )}
    </button>
  );
}
