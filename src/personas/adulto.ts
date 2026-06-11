import type { ApiClient } from "../api-client.js";
import type { PersonaGeneratedData } from "../data-generator.js";
import { runPersonaFlow } from "./flow.js";
import type { Persona, PersonaExecutionResult } from "./types.js";

export const PERSONA_NAME = "adulto" as const;

const adultoPersona: Persona = {
  name: PERSONA_NAME,
  behavior: {
    acceptOnboardingChecklist: true,
    recommendationAcceptRate: 1,
    completeManualTasks: true,
    completeOnboardingTasks: true,
  },
  async execute(
    apiClient: ApiClient,
    data: PersonaGeneratedData,
  ): Promise<PersonaExecutionResult> {
    return runPersonaFlow(PERSONA_NAME, adultoPersona.behavior, apiClient, data);
  },
};

export async function runAdultoPersona(
  apiClient: ApiClient,
  data: PersonaGeneratedData,
): Promise<PersonaExecutionResult> {
  return adultoPersona.execute(apiClient, data);
}

export { adultoPersona };
