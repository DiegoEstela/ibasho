import { Suspense } from "react";
import { Sidebar } from "@/components/nav/Sidebar";
import { TabBar } from "@/components/nav/TabBar";
import { NoteReveal } from "@/components/notitas/NoteReveal";
import { ProfileProvider } from "@/components/profile/ProfileProvider";
import { InstallProvider } from "@/components/pwa/InstallProvider";
import { QueryProvider } from "@/components/query/QueryProvider";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { requireHousehold } from "@/lib/household";

/** Exige sesión y hogar antes de mostrar el contenido privado. */
async function Gate({ children }: { children: React.ReactNode }) {
  await requireHousehold();
  return <>{children}</>;
}

/** Aviso de notitas nuevas: se monta una vez y permanece mientras se navega por la app. */
async function Notitas() {
  const { user, household } = await requireHousehold();
  return <NoteReveal userId={user.id} householdId={household.id} />;
}

/** Móvil: contenido + tab bar inferior. Escritorio: sidebar fija y contenido a pantalla completa. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
    <InstallProvider>
    <ProfileProvider>
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
      <Suspense>
        <Notitas />
      </Suspense>
    </div>
    </ProfileProvider>
    </InstallProvider>
    </QueryProvider>
  );
}
