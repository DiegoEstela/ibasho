/** Nombre corto de una tarjeta para listas y selectores: «Visa Ana ····4242». */
export function cardLabel(card: { name: string; last4: string | null }): string {
  return card.last4 ? `${card.name} ····${card.last4}` : card.name;
}
