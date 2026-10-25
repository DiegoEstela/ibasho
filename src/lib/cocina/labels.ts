export const DIFFICULTIES = [
  { value: "facil", label: "Fácil" },
  { value: "media", label: "Media" },
  { value: "dificil", label: "Difícil" },
] as const;

export function difficultyLabel(value: string) {
  return DIFFICULTIES.find((d) => d.value === value)?.label ?? value;
}
