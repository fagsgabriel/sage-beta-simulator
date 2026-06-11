import type { ApiClient } from "../api-client.js";
import type { PersonaGeneratedData } from "../data-generator.js";
import { runPersonaFlow } from "./flow.js";
import type { Persona, PersonaExecutionResult } from "./types.js";

export const PERSONA_NAME = "idoso" as const;

const idosoPersona: Persona = {
  name: PERSONA_NAME,
  behavior: {
    acceptOnboardingChecklist: true,
    recommendationAcceptRate: 0.15,
    completeManualTasks: false,
    completeOnboardingTasks: false,
  },
  async execute(
    apiClient: ApiClient,
    data: PersonaGeneratedData,
  ): Promise<PersonaExecutionResult> {
    return runPersonaFlow(PERSONA_NAME, idosoPersona.behavior, apiClient, data);
  },
};

export async function runIdosoPersona(
  apiClient: ApiClient,
  data: PersonaGeneratedData,
): Promise<PersonaExecutionResult> {
  return idosoPersona.execute(apiClient, data);
}

export { idosoPersona };
