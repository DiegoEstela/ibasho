import { paperOf, tiltFor } from "@/lib/notitas/papers";

type Props = {
  id: string;
  body: string;
  paper: string;
  sticker: string | null;
  /** Nombre de quien la escribió y fecha ya formateada. */
  from: string;
  date: string;
  /** Pegarla con una leve inclinación (en listas); en grande se muestra recta. */
  tilted?: boolean;
  size?: "sm" | "lg";
  children?: React.ReactNode;
};

/** Cartita de papel washi con cinta, sello rojo de quien la escribió y letra manuscrita. */
export function NoteCard({ id, body, paper, sticker, from, date, tilted = true, size = "sm", children }: Props) {
  const p = paperOf(paper);
  const large = size === "lg";

  return (
    <article
      className="relative rounded-[6px] shadow-[0_8px_22px_rgba(58,51,40,0.16)]"
      style={{
        color: "#3a3328",
        fontFamily: "var(--font-note)",
        transform: tilted ? `rotate(${tiltFor(id)}deg)` : undefined,
        background: p.color,
        // Fibras de papel washi: líneas casi invisibles y una luz suave en una esquina.
        backgroundImage:
          "radial-gradient(circle at 12% 8%, rgba(255,255,255,0.55), transparent 45%), repeating-linear-gradient(0deg, rgba(58,51,40,0.025) 0 1px, transparent 1px 4px)",
      }}
    >
      {/* Cinta washi */}
      <span
        aria-hidden
        className="absolute -top-2.5 left-1/2 h-5 w-16 -translate-x-1/2 rotate-[-2deg] rounded-[2px] opacity-80 shadow-sm"
        style={{ background: p.tape }}
      />

      {sticker && (
        <span aria-hidden className="absolute -left-2 -top-3 rotate-[-10deg] text-3xl drop-shadow-sm">
          {sticker}
        </span>
      )}

      <div className={large ? "px-6 pb-5 pt-8" : "px-4 pb-3.5 pt-6"}>
        <p className={`whitespace-pre-line break-words leading-relaxed ${large ? "text-[21px]" : "text-[17px]"}`}>{body}</p>

        <footer className="mt-4 flex items-end justify-between gap-3">
          <span className={`${large ? "text-base" : "text-sm"} opacity-75`}>
            — {from} · {date}
          </span>
          {/* Sello celeste con la inicial de quien la escribió */}
          <span
            aria-hidden
            className={`flex shrink-0 rotate-[-9deg] items-center justify-center rounded-full border-2 border-white/40 font-bold text-white shadow-sm ${
              large ? "size-11 text-lg" : "size-9 text-base"
            }`}
            style={{ background: "#3f88c5", fontFamily: "var(--font-display)" }}
          >
            {from.charAt(0).toUpperCase()}
          </span>
        </footer>
      </div>

      {children && <div className="border-t border-black/5 px-3 py-2">{children}</div>}
    </article>
  );
}
