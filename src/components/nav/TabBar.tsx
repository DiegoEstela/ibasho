"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, Download, MoreHorizontal, SlidersHorizontal, UserRound } from "lucide-react";
import { useProfile } from "@/components/profile/ProfileProvider";
import { useInstall } from "@/components/pwa/InstallProvider";
import { SignOutButton } from "./SignOutButton";
import { TabEditor } from "./TabEditor";
import { useTabPrefs } from "./tabPrefs";

/** Barra de pestañas inferior para teléfono (por debajo de lg). «Más» abre el resto de módulos. */
export function TabBar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const { hrefs, tabs, more, setTabs, reset, isDefault } = useTabPrefs();
  const install = useInstall();
  const profile = useProfile();

  const moreActive = more.some((m) => pathname.startsWith(m.href));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const tabClass = (active: boolean) =>
    `flex min-h-12 w-full flex-col items-center justify-center gap-0.5 text-[10px] transition ${active ? "text-forest" : "text-ink-soft"}`;

  return (
    <>
      {/* Toca fuera del panel para cerrarlo; queda por debajo de la barra para poder volver a pulsar «Más» */}
      {open && <button aria-label="Cerrar el menú" onClick={() => setOpen(false)} className="sheet-backdrop fixed inset-0 z-[19] bg-ink/25 lg:hidden" />}

      {open && (
        <div
          id="menu-mas"
          role="menu"
          aria-label="Más módulos"
          className="menu-grow fixed right-3 z-[21] max-h-[calc(100dvh-6rem)] w-60 overflow-y-auto rounded-2xl border border-line bg-surface p-2 shadow-xl lg:hidden"
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 3.75rem)" }}
        >
          {more.map(({ href, label, icon: Icon, available }) =>
            available ? (
              <Link
                key={href}
                href={href}
                role="menuitem"
                onClick={() => setOpen(false)}
                aria-current={pathname.startsWith(href) ? "page" : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition active:scale-[0.98] ${
                  pathname.startsWith(href) ? "bg-forest/15 text-forest" : "text-ink hover:bg-washi-deep"
                }`}
              >
                <Icon size={20} strokeWidth={1.75} />
                {label}
              </Link>
            ) : (
              <span key={href} role="menuitem" aria-disabled="true" className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-ink-soft/60">
                <Icon size={20} strokeWidth={1.75} />
                <span className="flex-1">{label}</span>
                <span className="rounded-full bg-washi-deep px-2 py-0.5 text-[10px] font-medium text-ink-soft">Pronto</span>
              </span>
            ),
          )}

          <div className="mx-2 my-1.5 h-px bg-line" />

          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setEditing(true);
            }}
            className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-ink transition hover:bg-washi-deep"
          >
            <SlidersHorizontal size={20} strokeWidth={1.75} />
            <span className="min-w-0 flex-1 truncate text-left">Personalizar la barra</span>
          </button>

          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              profile.open();
            }}
            className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-ink transition hover:bg-washi-deep"
          >
            <UserRound size={20} strokeWidth={1.75} />
            <span className="min-w-0 flex-1 truncate text-left">{profile.name ? `Mi perfil · ${profile.name}` : "Mi perfil"}</span>
          </button>

          {!install.installed && (
            <button
              role="menuitem"
              onClick={() => {
                setOpen(false);
                install.open();
              }}
              className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-forest transition hover:bg-washi-deep"
            >
              <Download size={20} strokeWidth={1.75} />
              Instalar la app
            </button>
          )}

          <Link
            href="/bienvenida"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm text-ink-soft transition hover:bg-washi-deep"
          >
            <Compass size={20} strokeWidth={1.75} />
            Ver guía de la app
          </Link>
          <SignOutButton variant="row" />
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/85 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <ul className="mx-auto flex max-w-xl">
          {tabs.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <li key={href} className="flex-1">
                <Link href={href} aria-current={active ? "page" : undefined} onClick={() => setOpen(false)} className={tabClass(active)}>
                  <Icon size={20} strokeWidth={active ? 2.25 : 1.75} />
                  {label}
                </Link>
              </li>
            );
          })}
          <li className="flex-1">
            <button
              onClick={() => setOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={open}
              aria-controls="menu-mas"
              className={tabClass(open || moreActive)}
            >
              <MoreHorizontal size={20} strokeWidth={open || moreActive ? 2.25 : 1.75} />
              Más
            </button>
          </li>
        </ul>
      </nav>
      <TabEditor open={editing} onClose={() => setEditing(false)} current={hrefs} onSave={setTabs} onReset={reset} isDefault={isDefault} />
    </>
  );
}
