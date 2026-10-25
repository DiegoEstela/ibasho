import { ArrowDownLeft, ArrowUpRight, PiggyBank } from "lucide-react";
import { formatEUR, toCents } from "@/lib/gastos/money";
import { buildMovements, contributionsByPerson, debitBalanceCents, type CardExpenseRow, type DepositRow } from "@/lib/tarjetas/debit";
import { formatDate } from "../types";
import type { Card, Person } from "./types";

type Props = {
  card: Card;
  deposits: DepositRow[];
  expenses: CardExpenseRow[];
  people: Person[];
  userId: string;
  /** Nombre de cada participante de gastos, por su id. */
  participantNames: Record<string, string>;
  onDeposit: () => void;
  /** Se llama al tocar un ingreso para ver su detalle o eliminarlo. */
  onOpenDeposit: (depositId: string) => void;
};

/** Saldo de una tarjeta de débito, cuánto puso cada persona y todos sus movimientos. */
export function DebitPanel({ card, deposits, expenses, people, userId, participantNames, onDeposit, onOpenDeposit }: Props) {
  const balance = debitBalanceCents(card.initial_balance, deposits, expenses);
  const deposited = deposits.reduce((s, d) => s + toCents(d.amount), 0);
  const spent = expenses.reduce((s, e) => s + toCents(e.amount), 0);
  const contributions = contributionsByPerson(deposits);

  const userName = (id: string | null) => {
    if (id === userId) return "Tú";
    return people.find((p) => p.id === id)?.name ?? "Alguien";
  };
  const movements = buildMovements(deposits, expenses, {
    user: userName,
    participant: (id) => (id ? (participantNames[id] ?? "Alguien") : "Cuenta compartida"),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-line bg-surface p-4 lg:p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-ink-soft">Saldo de {card.name}</p>
        <p className={`mt-1 font-display text-3xl font-bold ${balance < 0 ? "text-hanko" : ""}`}>{formatEUR(balance)}</p>
        <p className="mt-1 text-xs text-ink-soft">
          {card.initial_balance !== 0 && `Inicial ${formatEUR(toCents(card.initial_balance))} · `}
          Ingresado {formatEUR(deposited)} · Gastado {formatEUR(spent)}
        </p>
        {balance < 0 && <p className="mt-1 text-xs text-hanko">El saldo es negativo: se gastó más de lo que hay en la tarjeta.</p>}

        <button
          onClick={onDeposit}
          className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-forest px-5 text-sm font-medium text-surface shadow-sm transition active:scale-95"
        >
          <PiggyBank size={16} /> Ingresar dinero
        </button>
      </div>

      {Object.keys(contributions).length > 0 && (
        <div className="rounded-2xl border border-line bg-surface p-4 lg:p-5">
          <h3 className="text-xs font-medium uppercase tracking-wider text-ink-soft">Cuánto puso cada uno</h3>
          <ul className="mt-2 flex flex-col gap-2">
            {Object.entries(contributions)
              .sort((a, b) => b[1] - a[1])
              .map(([id, cents]) => {
                const person = people.find((p) => p.id === id);
                return (
                  <li key={id || "nadie"} className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2">
                      <span className="size-2.5 rounded-full" style={{ background: person?.color ?? "var(--moss)" }} />
                      {userName(id || null)}
                    </span>
                    <span className="font-medium">{formatEUR(cents)}</span>
                  </li>
                );
              })}
          </ul>
        </div>
      )}

      <div>
        <h3 className="mb-1.5 px-1 font-display text-base font-bold lg:text-lg">Movimientos</h3>
        {movements.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line bg-surface/60 p-6 text-center text-sm text-ink-soft">
            Aún no hay movimientos. Registra un ingreso, o paga un gasto eligiendo esta tarjeta en «Pagado con».
          </p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {movements.map((m) => (
              <li key={m.key}>
                <button
                  disabled={m.kind !== "deposit"}
                  onClick={() => m.kind === "deposit" && onOpenDeposit(m.key.slice(2))}
                  className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left"
                >
                <span
                  className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${
                    m.kind === "deposit" ? "bg-forest/15 text-forest" : "bg-hanko/10 text-hanko"
                  }`}
                >
                  {m.kind === "deposit" ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px]">{m.title}</span>
                  <span className="block text-xs text-ink-soft">
                    {m.kind === "deposit" ? `Puso ${m.who}` : m.who} · {formatDate(m.date)}
                  </span>
                </span>
                <span className={`text-[15px] font-medium ${m.kind === "deposit" ? "text-forest" : ""}`}>
                  {m.cents > 0 ? "+" : "−"}
                  {formatEUR(Math.abs(m.cents))}
                </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
