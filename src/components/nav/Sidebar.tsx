"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, Download } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { DeloLink } from "@/components/brand/DeloLogo";
import { useProfile } from "@/components/profile/ProfileProvider";
import { useInstall } from "@/components/pwa/InstallProvider";
import { SignOutButton } from "./SignOutButton";
import { navModules } from "./items";

/** Navegación lateral para escritorio (lg y superior): todos los módulos a la vista. */
export function Sidebar() {
  const pathname = usePathname();
  const install = useInstall();
  const profile = useProfile();

  return (
    <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-line bg-surface/70 px-4 py-6 backdrop-blur lg:flex">
      <div className="flex items-center gap-3 px-2">
        <Logo size={40} />
        <div>
          <p className="font-display text-lg font-bold leading-tight tracking-[0.2em]">居場所</p>
          <p className="text-xs text-ink-soft">Ibasho</p>
        </div>
      </div>

      <nav aria-label="Módulos" className="mt-8 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {navModules.map(({ href, label, icon: Icon, available }) => {
          if (!available) {
            return (
              <span
                key={href}
                aria-disabled="true"
                className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-ink-soft/60"
              >
                <Icon size={20} strokeWidth={1.75} />
                <span className="flex-1 text-sm font-medium">{label}</span>
                <span className="rounded-full bg-washi-deep px-2 py-0.5 text-[10px] font-medium text-ink-soft">Pronto</span>
              </span>
            );
          }
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-11 items-center gap-3 rounded-xl px-3 transition ${
                active ? "bg-forest/15 text-forest" : "text-ink-soft hover:bg-washi-deep hover:text-ink"
              }`}
            >
              <Icon size={20} strokeWidth={1.75} />
              <span className="text-sm font-medium">{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-3 flex flex-col gap-1 border-t border-line pt-3">
        <button
          onClick={profile.open}
          className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-left transition hover:bg-washi-deep"
        >
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
            style={{ background: profile.color }}
            aria-hidden
          >
            {(profile.name.charAt(0) || "?").toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{profile.name || "Mi perfil"}</span>
            <span className="block text-[11px] text-ink-soft">Editar mi nombre</span>
          </span>
        </button>
        {!install.installed && install.canPrompt && (
          <button
            onClick={install.open}
            className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-forest transition hover:bg-washi-deep"
          >
            <Download size={20} strokeWidth={1.75} />
            Instalar la app
          </button>
        )}
        <Link
          href="/bienvenida"
          className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm text-ink-soft transition hover:bg-washi-deep hover:text-ink"
        >
          <Compass size={20} strokeWidth={1.75} />
          Ver guía de la app
        </Link>
        <SignOutButton variant="row" />
        <div className="mt-1 flex flex-col items-center gap-1 border-t border-line px-3 pt-3">
          <span className="text-[10px] uppercase tracking-[0.2em] text-ink-soft">Creado por</span>
          <DeloLink className="flex min-h-11 items-center rounded-lg opacity-90 transition hover:opacity-100" logoClassName="w-28" />
        </div>
      </div>
    </aside>
  );
}
