import type { LucideIcon } from "lucide-react";

const tones = {
  forest: "bg-forest/15 text-forest",
  terracotta: "bg-terracotta/15 text-terracotta",
  sky: "bg-sky/25 text-sky",
  sakura: "bg-sakura/30 text-terracotta",
  moss: "bg-moss/20 text-moss",
} as const;

type Props = {
  icon: LucideIcon;
  tone: keyof typeof tones;
  title: string;
  text: string;
  badge?: string;
  eyebrow?: string;
};

/** Diapositiva con icono, título y una línea de explicación. */
export function InfoSlide({ icon: Icon, tone, title, text, badge, eyebrow }: Props) {
  return (
    <>
      <div className={`flex size-28 items-center justify-center rounded-[2rem] ${tones[tone]}`}>
        <Icon size={52} strokeWidth={1.5} />
      </div>
      {badge && (
        <span className="mt-6 rounded-full bg-washi-deep px-3 py-1 text-xs font-medium text-ink-soft">
          {badge}
        </span>
      )}
      {eyebrow && (
        <p className="mt-8 font-display text-lg tracking-[0.2em] text-terracotta">{eyebrow}</p>
      )}
      <h1 className={`${badge ? "mt-3" : eyebrow ? "mt-2" : "mt-8"} font-display text-3xl font-bold`}>{title}</h1>
      <p className="mt-3 max-w-xs text-lg leading-relaxed text-ink-soft">{text}</p>
    </>
  );
}
