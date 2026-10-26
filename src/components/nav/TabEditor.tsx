"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { navModules, TAB_COUNT } from "./items";

type Props = {
  open: boolean;
  onClose: () => void;
  current: string[];
  onSave: (hrefs: string[]) => void;
  onReset: () => void;
  isDefault: boolean;
};

/** Elegir qué módulos van en la barra de abajo del teléfono; los demás quedan en «Más». */
export function TabEditor(props: Props) {
  return (
    <BottomSheet open={props.open} onClose={props.onClose} title="Barra de abajo">
      {props.open && <TabForm {...props} />}
    </BottomSheet>
  );
}

function TabForm({ onClose, current, onSave, onReset, isDefault }: Props) {
  // El orden en que los eliges es el orden en la barra.
  const [picked, setPicked] = useState<string[]>(current);

  const toggle = (href: string) =>
    setPicked((prev) => (prev.includes(href) ? prev.filter((h) => h !== href) : prev.length < TAB_COUNT ? [...prev, href] : prev));

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-soft">
        Elige {TAB_COUNT} módulos para tenerlos siempre a mano. El resto queda dentro de «Más». Se guarda en este teléfono.
      </p>

      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {navModules
          .filter((m) => m.available)
          .map(({ href, label, icon: Icon }) => {
            const position = picked.indexOf(href);
            const selected = position !== -1;
            const full = picked.length >= TAB_COUNT && !selected;
            return (
              <li key={href}>
                <button
                  type="button"
                  onClick={() => toggle(href)}
                  aria-pressed={selected}
                  disabled={full}
                  className="flex min-h-12 w-full items-center gap-3 px-4 text-left transition active:bg-washi-deep/50 disabled:opacity-40"
                >
                  <Icon size={20} strokeWidth={1.75} className={selected ? "text-forest" : "text-ink-soft"} />
                  <span className="flex-1 text-[15px]">{label}</span>
                  {selected ? (
                    <span className="flex size-6 items-center justify-center rounded-full bg-forest text-xs font-bold text-surface">{position + 1}</span>
                  ) : (
                    <span className="size-6 rounded-full border-2 border-line" />
                  )}
                </button>
              </li>
            );
          })}
      </ul>

      <p className="text-center text-sm text-ink-soft" aria-live="polite">
        {picked.length === TAB_COUNT ? <span className="flex items-center justify-center gap-1.5 text-forest"><Check size={15} /> Listo: {TAB_COUNT} elegidos</span> : `${picked.length} de ${TAB_COUNT} elegidos`}
      </p>

      <button
        disabled={picked.length !== TAB_COUNT}
        onClick={() => {
          onSave(picked);
          onClose();
        }}
        className="min-h-12 rounded-2xl bg-forest px-8 text-base font-medium text-surface shadow-sm transition active:scale-95 disabled:opacity-50"
      >
        Guardar
      </button>
      {!isDefault && (
        <button
          onClick={() => {
            onReset();
            onClose();
          }}
          className="min-h-11 text-sm text-ink-soft"
        >
          Volver a los de siempre
        </button>
      )}
    </div>
  );
}
