export type Cat = {
  name: string;
  icon: string;
  color: string;
  custom: boolean;
  /** Solo en categorías propias. */
  id?: string;
};

export type CustomCategoryRow = {
  id: string;
  name: string;
  icon: string;
  color: string;
  position: number;
};
