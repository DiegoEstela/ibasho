"use client";

import { useState } from "react";

/** Foto de un producto (viene de la tienda). Si no carga o no hay, se muestra un regalito. */
export function ProductImage({ src, alt, className = "" }: { src: string | null; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className={`flex items-center justify-center bg-gradient-to-br from-sakura/40 to-sky/30 text-4xl ${className}`} aria-hidden>
        🎁
      </div>
    );
  }
  return (
    // Las fotos son de otras tiendas: se muestran tal cual y sin enviar de qué página vienen.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className={`object-cover ${className}`} />
  );
}
