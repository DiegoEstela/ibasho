import { Sidebar } from "@/components/nav/Sidebar";
import { TabBar } from "@/components/nav/TabBar";

/** Móvil: contenido + tab bar inferior. Escritorio: sidebar fija y contenido a pantalla completa. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <Sidebar />
      <main className="px-5 pb-24 pt-8 lg:ml-64 lg:px-10 lg:pb-10 lg:pt-10">{children}</main>
      <TabBar />
    </div>
  );
}
