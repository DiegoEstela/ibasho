import Link from "next/link";
import { Compass } from "lucide-react";
import { PagePlaceholder } from "@/components/ui/PagePlaceholder";
import { SignOutButton } from "@/components/nav/SignOutButton";

export default function Page() {
  return (
    <>
      <PagePlaceholder title="Más" note="Aquí irán Viajes, Wishlist, Notas, Tareas y Ajustes." />
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/bienvenida"
          className="flex min-h-11 items-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm text-ink-soft transition active:scale-95"
        >
          <Compass size={18} strokeWidth={1.75} />
          Ver guía de la app
        </Link>
        <SignOutButton />
      </div>
    </>
  );
}
