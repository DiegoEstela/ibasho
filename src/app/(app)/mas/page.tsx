import { PagePlaceholder } from "@/components/ui/PagePlaceholder";
import { SignOutButton } from "@/components/nav/SignOutButton";

export default function Page() {
  return (
    <>
      <PagePlaceholder title="Más" note="Aquí irán Viajes, Wishlist, Notas, Tareas y Ajustes." />
      <div className="mt-6">
        <SignOutButton />
      </div>
    </>
  );
}
