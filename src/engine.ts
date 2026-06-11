import type { PersonaType } from "./data-generator.js";

/**
 * Orquestrador de simulação com execução híbrida.
 * Implementação completa em SAG-46.
 */
export interface SimulationOptions {
  users: number;
  persona?: PersonaType;
  env: string;
}

export async function runSimulation(_options: SimulationOptions): Promise<void> {
  throw new Error("Engine não implementado — ver SAG-46");
}
