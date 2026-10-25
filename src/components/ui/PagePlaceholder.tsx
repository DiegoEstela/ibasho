import { PageHeader } from "@/components/ui/PageHeader";

type Props = {
  title: string;
  note: string;
};

/** Cabecera de sección con su nota; sirve de base hasta construir cada módulo. */
export function PagePlaceholder({ title, note }: Props) {
  return (
    <section>
      <PageHeader title={title} />
      <div className="mt-3 rounded-2xl border border-line bg-surface p-4 text-sm text-ink-soft lg:p-6 lg:text-base">
        {note}
      </div>
    </section>
  );
}
