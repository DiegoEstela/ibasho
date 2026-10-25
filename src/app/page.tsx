import { Heart, MapPin, ShoppingBasket, Wallet } from "lucide-react";
import { Greeting } from "@/components/brand/Greeting";
import { Logo } from "@/components/brand/Logo";
import { InfoSlide } from "@/components/onboarding/InfoSlide";
import { SlideShow } from "@/components/onboarding/SlideShow";

const slides = [
  {
    key: "bienvenida",
    content: (
      <div className="flex flex-col items-center gap-5">
        <Logo size={128} />
        <h1 className="font-display text-5xl font-bold tracking-[0.3em] text-ink">居場所</h1>
        <p className="font-display text-xl text-forest">Ibasho</p>
        <Greeting className="mt-4 font-display text-lg text-terracotta" />
      </div>
    ),
  },
  {
    key: "compras",
    content: (
      <InfoSlide
        icon={ShoppingBasket}
        tone="terracotta"
        title="Compren mejor, gasten menos"
        text="Su lista de compras, siempre al día en los dos teléfonos. Suban el ticket del supermercado y la app aprende qué compran, cuánto gastan y qué les conviene comprar."
      />
    ),
  },
  {
    key: "gastos",
    content: (
      <InfoSlide
        icon={Wallet}
        tone="moss"
        title="Cuentas claras, cero discusiones"
        text="Anoten quién pagó qué, incluso las compras con tarjeta en cuotas, y vean al instante quién le debe a quién. Sin calculadoras ni malentendidos."
      />
    ),
  },
  {
    key: "viajes",
    content: (
      <InfoSlide
        icon={MapPin}
        tone="sky"
        title="Viajen sin líos"
        text="Gastos a medias, reservas y entradas siempre a mano, y todos los lugares que quieren conocer en un solo sitio."
      />
    ),
  },
  {
    key: "ibasho",
    content: (
      <InfoSlide
        icon={Heart}
        tone="sakura"
        eyebrow="居場所 · ibasho"
        title="Su lugar en el mundo"
        text="En japonés, ibasho es el lugar donde te sientes en casa y puedes ser tú mismo. A veces es un rincón, a veces una persona. Ibasho quiere ser ese lugar para ustedes dos."
      />
    ),
  },
];

export default function Home() {
  return (
    <main className="relative min-h-dvh overflow-hidden">
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

      <SlideShow
        slides={slides}
        finishHref="/login"
        finishLabel="Empezar"
        skipHref="/login"
        cookie="ibasho_intro"
      />
    </main>
  );
}
