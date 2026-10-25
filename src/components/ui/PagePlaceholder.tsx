type Props = {
  title: string;
  note: string;
};

/** Cabecera de sección con título grande; sirve de base hasta construir cada módulo. */
export function PagePlaceholder({ title, note }: Props) {
  return (
    <section>
      <h1 className="font-display text-3xl font-bold lg:text-4xl">{title}</h1>
      <div className="mt-6 rounded-2xl border border-line bg-surface p-6 text-ink-soft">
        {note}
      </div>
    </section>
  );
}
