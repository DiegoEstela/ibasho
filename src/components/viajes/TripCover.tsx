import { colorFor } from "@/lib/compras/icons";

// Olas japonesas (seigaiha), muy sutiles, como textura de la portada.
const WAVES =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='44' height='22' viewBox='0 0 44 22'%3E%3Cg fill='none' stroke='white' stroke-opacity='.2' stroke-width='1.2'%3E%3Ccircle cx='22' cy='22' r='11'/%3E%3Ccircle cx='22' cy='22' r='7'/%3E%3Ccircle cx='0' cy='11' r='11'/%3E%3Ccircle cx='0' cy='11' r='7'/%3E%3Ccircle cx='44' cy='11' r='11'/%3E%3Ccircle cx='44' cy='11' r='7'/%3E%3C/g%3E%3C/svg%3E\")";

type Props = {
  color: string;
  /** Foto de portada (enlace temporal); si no hay, se muestra el color con las olas. */
  coverUrl?: string | null;
  className?: string;
  children?: React.ReactNode;
};

/** Portada de un viaje: foto con velo oscuro, o un degradado de color con olas japonesas. */
export function TripCover({ color, coverUrl, className = "", children }: Props) {
  const base = colorFor(color);
  return (
    <div
      className={`relative isolate overflow-hidden text-white ${className}`}
      style={{ background: `linear-gradient(135deg, ${base} 0%, color-mix(in srgb, ${base} 55%, black) 100%)` }}
    >
      {coverUrl ? (
        // La foto es un enlace temporal del almacenamiento privado, por eso no pasa por next/image.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={coverUrl} alt="" className="absolute inset-0 -z-10 size-full object-cover" />
      ) : (
        <div aria-hidden className="absolute inset-0 -z-10" style={{ backgroundImage: WAVES, backgroundSize: "44px 22px" }} />
      )}
      {coverUrl && <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-black/60 via-black/10 to-black/20" />}
      {children}
    </div>
  );
}
