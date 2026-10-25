import { Suspense } from "react";
import { CookingPot, ListChecks, Mail, MapPin, ShoppingBasket, Wallet } from "lucide-react";
import { InfoSlide } from "@/components/onboarding/InfoSlide";
import { SlideShow } from "@/components/onboarding/SlideShow";
import { requireHousehold } from "@/lib/household";

const slides = [
  {
    key: "compras",
    content: (
      <InfoSlide
        icon={ShoppingBasket}
        tone="terracotta"
        badge="Próximamente"
        title="Compras sin olvidos"
        text="Cualquiera de los dos añade o tacha productos y el otro lo ve al instante. Suban el ticket y sepan en qué se va el dinero del supermercado."
      />
    ),
  },
  {
    key: "viajes",
    content: (
      <InfoSlide
        icon={MapPin}
        tone="sky"
        badge="Próximamente"
        title="Viajes sin líos"
        text="Gastos a medias, reservas y entradas a mano, y la lista de lugares que quieren conocer."
      />
    ),
  },
  {
    key: "gastos",
    content: (
      <InfoSlide
        icon={Wallet}
        tone="moss"
        badge="Disponible"
        title="Gastos sin cálculos"
        text="Cada pago queda anotado y la app calcula quién le debe a quién. Incluye las compras con tarjeta en cuotas."
      />
    ),
  },
  {
    key: "mensajes",
    content: (
      <InfoSlide
        icon={Mail}
        tone="sakura"
        badge="Próximamente"
        title="Un detalle cada día"
        text="Escribe una notita para tu pareja. Aparecerá al abrir la app: un gesto pequeño que alegra el día."
      />
    ),
  },
  {
    key: "mas",
    content: (
      <InfoSlide
        icon={ListChecks}
        tone="forest"
        badge="Próximamente"
        title="La casa en orden"
        text="Tareas con recordatorios, notas con medidas y datos útiles, y una wishlist de todo lo que sueñan tener."
      />
    ),
  },
  {
    key: "cocina",
    content: (
      <InfoSlide
        icon={CookingPot}
        tone="terracotta"
        badge="Disponible"
        title="Cocina"
        text="Guarden sus recetas y pasen los ingredientes a la lista de compras con un toque."
      />
    ),
  },
];

async function Guia() {
  await requireHousehold();
  return (
    <SlideShow slides={slides} finishHref="/inicio" finishLabel="Ir a mi hogar" skipHref="/inicio" />
  );
}

export default function BienvenidaPage() {
  return (
    <main className="min-h-dvh">
      <Suspense>
        <Guia />
      </Suspense>
    </main>
  );
}
