import Link from "next/link";
import { Greeting } from "@/components/brand/Greeting";
import { Logo } from "@/components/brand/Logo";

export default function Home() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 text-center">
      {/* nubes lentas */}
      <svg
        aria-hidden
        className="cloud absolute left-0 top-16 w-56 text-sky/40"
        viewBox="0 0 200 60"
        fill="currentColor"
      >
        <ellipse cx="60" cy="38" rx="50" ry="16" />
        <ellipse cx="100" cy="28" rx="40" ry="18" />
        <ellipse cx="140" cy="38" rx="44" ry="14" />
      </svg>
      <svg
        aria-hidden
        className="cloud absolute right-0 top-40 w-40 text-sakura/40"
        viewBox="0 0 200 60"
        fill="currentColor"
      >
        <ellipse cx="60" cy="38" rx="50" ry="16" />
        <ellipse cx="110" cy="28" rx="40" ry="18" />
      </svg>

      <div className="relative z-10 flex flex-col items-center gap-5">
        <Logo size={128} />
        <h1 className="font-display text-5xl font-bold tracking-[0.3em] text-ink">
          居場所
        </h1>
        <p className="font-display text-xl text-forest">Ibasho</p>
        <Greeting className="mt-6 font-display text-lg text-terracotta" />

        <Link
          href="/inicio"
          className="mt-2 inline-flex min-h-11 items-center rounded-2xl bg-forest px-8 text-base font-medium text-surface shadow-sm transition active:scale-95"
        >
          Entrar
        </Link>
      </div>
    </main>
  );
}
