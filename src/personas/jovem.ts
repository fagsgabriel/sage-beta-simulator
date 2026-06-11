import type { ApiClient } from "../api-client.js";
import type { PersonaGeneratedData } from "../data-generator.js";
import { runPersonaFlow } from "./flow.js";
import type { Persona, PersonaExecutionResult } from "./types.js";

export const PERSONA_NAME = "jovem" as const;

const jovemPersona: Persona = {
  name: PERSONA_NAME,
  behavior: {
    acceptOnboardingChecklist: true,
    recommendationAcceptRate: 0.45,
    completeManualTasks: true,
    completeOnboardingTasks: false,
  },
  async execute(
    apiClient: ApiClient,
    data: PersonaGeneratedData,
  ): Promise<PersonaExecutionResult> {
    return runPersonaFlow(PERSONA_NAME, jovemPersona.behavior, apiClient, data);
  },
};

export async function runJovemPersona(
  apiClient: ApiClient,
  data: PersonaGeneratedData,
): Promise<PersonaExecutionResult> {
  return jovemPersona.execute(apiClient, data);
}

export { jovemPersona };
