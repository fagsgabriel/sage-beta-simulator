import type { ApiClient } from "../api-client.js";
import type { PersonaGeneratedData, PersonaType } from "../data-generator.js";

export interface PersonaExecutionResult {
  persona: PersonaType;
  userId: string;
  email: string;
  password: string;
  name: string;
  assetIds: string[];
}

export interface PersonaBehavior {
  /** Aceita o checklist de onboarding via bulk create. */
  acceptOnboardingChecklist: boolean;
  /** Probabilidade (0–1) de aceitar cada recomendação pendente. */
  recommendationAcceptRate: number;
  /** Conclui tasks manuais criadas no fluxo. */
  completeManualTasks: boolean;
  /** Conclui uma task de onboarding após aceitar o checklist. */
  completeOnboardingTasks: boolean;
}

export interface Persona {
  readonly name: PersonaType;
  readonly behavior: PersonaBehavior;
  execute(
    apiClient: ApiClient,
    data: PersonaGeneratedData,
  ): Promise<PersonaExecutionResult>;
}
