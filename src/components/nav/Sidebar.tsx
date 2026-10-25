"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/brand/Logo";
import { navItems } from "./items";

/** Navegación lateral para escritorio (lg y superior). */
export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-line bg-surface/70 px-4 py-6 backdrop-blur lg:flex">
      <div className="flex items-center gap-3 px-2">
        <Logo size={40} />
        <div>
          <p className="font-display text-lg font-bold leading-tight tracking-[0.2em]">居場所</p>
          <p className="text-xs text-ink-soft">Ibasho</p>
        </div>
      </div>

      <nav className="mt-8 flex flex-col gap-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-11 items-center gap-3 rounded-xl px-3 transition ${
                active
                  ? "bg-forest/15 text-forest"
                  : "text-ink-soft hover:bg-washi-deep hover:text-ink"
              }`}
            >
              <Icon size={20} strokeWidth={1.75} />
              <span className="text-sm font-medium">{label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
