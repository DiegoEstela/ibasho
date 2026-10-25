/** Esqueleto que se muestra al instante mientras llegan los datos de la pantalla. */
export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Cargando" className="animate-pulse">
      <div className="h-6 w-40 rounded-lg bg-washi-deep lg:h-10 lg:w-64" />
      <div className="mt-2 h-3 w-24 rounded bg-washi-deep" />
      <div className="mt-5 flex flex-col gap-3">
        <div className="h-11 rounded-xl bg-washi-deep" />
        <div className="h-24 rounded-2xl bg-washi-deep" />
        <div className="h-24 rounded-2xl bg-washi-deep" />
      </div>
    </div>
  );
}
