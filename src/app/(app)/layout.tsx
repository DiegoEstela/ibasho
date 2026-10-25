import { Suspense } from "react";
import { Sidebar } from "@/components/nav/Sidebar";
import { TabBar } from "@/components/nav/TabBar";
import { requireHousehold } from "@/lib/household";

/** Exige sesión y hogar antes de mostrar el contenido privado. */
async function Gate({ children }: { children: React.ReactNode }) {
  await requireHousehold();
  return <>{children}</>;
}

/** Móvil: contenido + tab bar inferior. Escritorio: sidebar fija y contenido a pantalla completa. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <Sidebar />
      <main className="px-5 pb-24 pt-8 lg:ml-64 lg:px-10 lg:pb-10 lg:pt-10">
        <Suspense>
          <Gate>{children}</Gate>
        </Suspense>
      </main>
      <TabBar />
    </div>
  );
}
