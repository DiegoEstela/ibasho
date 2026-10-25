"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

type Slide = { key: string; content: React.ReactNode };

type Props = {
  slides: Slide[];
  finishHref: string;
  finishLabel: string;
  /** Si se indica, "Saltar" lleva aquí. Sin valor, no se muestra. */
  skipHref?: string;
  /** Cookie que se guarda al terminar o saltar (marca la presentación como vista). */
  cookie?: string;
};

/** Presentación a pantalla completa con puntos, botones y gesto de deslizar. */
export function SlideShow({ slides, finishHref, finishLabel, skipHref, cookie }: Props) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [touchX, setTouchX] = useState<number | null>(null);
  const last = index === slides.length - 1;

  function leave(href: string) {
    if (cookie) document.cookie = `${cookie}=1; path=/; max-age=31536000; samesite=lax`;
    router.push(href);
  }

  const next = () => (last ? leave(finishHref) : setIndex((i) => i + 1));
  const back = () => setIndex((i) => Math.max(0, i - 1));

  return (
    <div
      className="relative z-10 flex min-h-dvh flex-col px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4"
      onTouchStart={(e) => setTouchX(e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX == null) return;
        const dx = e.changedTouches[0].clientX - touchX;
        if (dx < -50 && !last) next();
        if (dx > 50) back();
        setTouchX(null);
      }}
    >
      <div className="flex h-11 items-center justify-between">
        {index > 0 ? (
          <button
            onClick={back}
            aria-label="Anterior"
            className="flex size-11 items-center justify-center rounded-full text-ink-soft"
          >
            <ChevronLeft size={22} />
          </button>
        ) : (
          <span />
        )}
        {skipHref && !last && (
          <button onClick={() => leave(skipHref)} className="min-h-11 px-3 text-sm text-ink-soft">
            Saltar
          </button>
        )}
      </div>

      <div key={slides[index].key} className="slide-in mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center text-center">
        {slides[index].content}
      </div>

      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-5">
        <div className="flex gap-2" role="tablist" aria-label="Progreso">
          {slides.map((s, n) => (
            <span
              key={s.key}
              aria-current={n === index}
              className={`h-2 rounded-full transition-all ${n === index ? "w-6 bg-forest" : "w-2 bg-ink-soft/30"}`}
            />
          ))}
        </div>
        <button
          onClick={next}
          className="min-h-12 w-full rounded-2xl bg-forest px-8 text-base font-medium text-surface shadow-sm transition active:scale-95"
        >
          {last ? finishLabel : "Siguiente"}
        </button>
      </div>
    </div>
  );
}
