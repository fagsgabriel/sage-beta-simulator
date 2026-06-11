import type { PersonaType } from "../data-generator.js";
import { adultoPersona } from "./adulto.js";
import { idosoPersona } from "./idoso.js";
import { jovemPersona } from "./jovem.js";
import type { Persona } from "./types.js";

export type {
  Persona,
  PersonaBehavior,
  PersonaExecutionResult,
  PersonaSetupState,
} from "./types.js";
export { runPersonaSetup, runPersonaDailyActions, runPersonaFlow } from "./flow.js";
export { runJovemPersona, jovemPersona, PERSONA_NAME as JOVEM_PERSONA_NAME } from "./jovem.js";
export { runAdultoPersona, adultoPersona, PERSONA_NAME as ADULTO_PERSONA_NAME } from "./adulto.js";
export { runIdosoPersona, idosoPersona, PERSONA_NAME as IDOSO_PERSONA_NAME } from "./idoso.js";

export const PERSONAS: Record<PersonaType, Persona> = {
  jovem: jovemPersona,
  adulto: adultoPersona,
  idoso: idosoPersona,
};

export function getPersona(persona: PersonaType): Persona {
  return PERSONAS[persona];
}
