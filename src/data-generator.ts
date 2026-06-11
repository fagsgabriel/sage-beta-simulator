/**
 * Gerador de dados plausíveis por persona via Groq.
 * Implementação completa em SAG-44.
 */
export type PersonaType = "jovem" | "adulto" | "idoso";

export interface GeneratedData {
  persona: PersonaType;
  assets: unknown[];
}
