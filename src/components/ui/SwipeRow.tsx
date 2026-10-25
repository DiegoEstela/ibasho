"use client";

import { useRef, useState } from "react";
import { Check, Trash2 } from "lucide-react";

type Props = {
  children: React.ReactNode;
  onSwipeRight: () => void;
  onSwipeLeft: () => void;
  rightLabel: string;
};

const THRESHOLD = 80;

/** Fila deslizable: a la derecha completa, a la izquierda borra. */
export function SwipeRow({ children, onSwipeRight, onSwipeLeft, rightLabel }: Props) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; horizontal: boolean | null } | null>(null);

  function onPointerDown(e: React.PointerEvent) {
    start.current = { x: e.clientX, y: e.clientY, horizontal: null };
  }

  function onPointerMove(e: React.PointerEvent) {
    const s = start.current;
    if (!s) return;
    const mx = e.clientX - s.x;
    const my = e.clientY - s.y;
    if (s.horizontal === null && (Math.abs(mx) > 8 || Math.abs(my) > 8)) {
      s.horizontal = Math.abs(mx) > Math.abs(my);
      if (s.horizontal) {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setDragging(true);
      }
    }
    if (s.horizontal) setDx(Math.max(-140, Math.min(140, mx)));
  }

  function end() {
    if (start.current?.horizontal) {
      if (dx > THRESHOLD) onSwipeRight();
      else if (dx < -THRESHOLD) onSwipeLeft();
    }
    start.current = null;
    setDragging(false);
    setDx(0);
  }

  return (
    <div className="relative overflow-hidden">
      <div aria-hidden className="absolute inset-0 flex items-center justify-between px-5 text-sm font-medium text-surface">
        <span className="flex items-center gap-2" style={{ opacity: dx > 0 ? 1 : 0 }}>
          <Check size={18} /> {rightLabel}
        </span>
        <span className="flex items-center gap-2" style={{ opacity: dx < 0 ? 1 : 0 }}>
          Borrar <Trash2 size={18} />
        </span>
        <div
          className="absolute inset-0 -z-10"
          style={{ background: dx >= 0 ? "var(--forest)" : "var(--hanko)" }}
        />
      </div>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={end}
        onPointerCancel={end}
        className="relative bg-surface"
        style={{
          transform: `translateX(${dx}px)`,
          transition: dragging ? "none" : "transform 0.2s ease-out",
          touchAction: "pan-y",
        }}
      >
        {children}
      </div>
    </div>
  );
}
