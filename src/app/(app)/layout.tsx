import { Suspense } from "react";
import { Sidebar } from "@/components/nav/Sidebar";
import { TabBar } from "@/components/nav/TabBar";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
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
      <Suspense>
        <Sidebar />
      </Suspense>
      <main className="px-4 pb-20 pt-[max(0.75rem,env(safe-area-inset-top))] lg:ml-64 lg:px-10 lg:pb-10 lg:pt-10">
        <Suspense fallback={<PageSkeleton />}>
          <Gate>{children}</Gate>
        </Suspense>
      </main>
      <Suspense>
        <TabBar />
      </Suspense>
    </div>
  );
}
