import { ApiClient } from "./api-client.js";
import {
  getGeneratedData,
  loadEnvFile,
  type PersonaType,
} from "./data-generator.js";
import {
  getPersona,
  runPersonaDailyActions,
  runPersonaSetup,
  type PersonaExecutionResult,
} from "./personas/index.js";
import { sleep } from "./personas/utils.js";

const PERSONA_ROTATION: PersonaType[] = ["jovem", "adulto", "idoso"];
const SETUP_DELAY_BETWEEN_USERS_MS = 2_000;

export interface SimulationOptions {
  users: number;
  persona?: PersonaType;
  env: string;
  regenerate?: boolean;
}

export interface SimulationUser extends PersonaExecutionResult {}

export interface SimulationError {
  index: number;
  persona: PersonaType;
  email?: string;
  phase: "setup" | "daily";
  message: string;
}

export interface SimulationResult {
  users: SimulationUser[];
  errors: SimulationError[];
  durationMs: number;
}

interface SimulationSlot {
  index: number;
  persona: PersonaType;
  apiClient: ApiClient;
}

/**
 * Resolve a URL da API conforme o ambiente informado.
 * Prioriza `API_URL_<ENV>` (ex.: API_URL_PRODUCTION) e faz fallback para `API_URL`.
 */
export function resolveApiUrl(env: string): string {
  const normalizedEnv = env.trim().toUpperCase();
  const envSpecificKey = `API_URL_${normalizedEnv}`;
  const envSpecificUrl = process.env[envSpecificKey];
  if (envSpecificUrl) {
    return envSpecificUrl.replace(/\/$/, "");
  }

  const defaultUrl = process.env.API_URL;
  if (!defaultUrl) {
    throw new Error(
      `URL da API não definida. Configure API_URL ou ${envSpecificKey} no .env`,
    );
  }

  return defaultUrl.replace(/\/$/, "");
}

/** Distribui N usuários pelas personas de forma equilibrada (round-robin). */
export function distributePersonas(
  users: number,
  persona?: PersonaType,
): PersonaType[] {
  if (users <= 0) {
    throw new Error("--users deve ser maior que zero");
  }

  if (persona) {
    return Array.from({ length: users }, () => persona);
  }

  return Array.from({ length: users }, (_, index) => {
    return PERSONA_ROTATION[index % PERSONA_ROTATION.length] as PersonaType;
  });
}

function formatLogPrefix(userIndex: number, total: number, persona: PersonaType): string {
  return `[engine] Usuário ${userIndex}/${total} (${persona})`;
}

function toSimulationError(
  slot: SimulationSlot,
  total: number,
  phase: SimulationError["phase"],
  error: unknown,
): SimulationError {
  const message = error instanceof Error ? error.message : String(error);
  return {
    index: slot.index,
    persona: slot.persona,
    phase,
    message: `${formatLogPrefix(slot.index, total, slot.persona)} — ${phase}: ${message}`,
  };
}

/**
 * Orquestrador de simulação com execução híbrida:
 * setup sequencial por usuário, ações do dia-a-dia em paralelo.
 */
export async function runSimulation(
  options: SimulationOptions,
): Promise<SimulationResult> {
  const startedAt = Date.now();
  loadEnvFile();

  const { users, persona, env, regenerate = false } = options;
  const apiUrl = resolveApiUrl(env);
  const personaAssignments = distributePersonas(users, persona);

  console.log(`[engine] Ambiente: ${env} (${apiUrl})`);
  console.log(`[engine] Simulando ${users} usuário(s)...`);
  console.log(
    `[engine] Distribuição: ${summarizeDistribution(personaAssignments)}`,
  );

  const generatedData = await getGeneratedData({ regenerate });

  const slots: SimulationSlot[] = personaAssignments.map(
    (assignedPersona, index) => ({
      index: index + 1,
      persona: assignedPersona,
      apiClient: new ApiClient(apiUrl),
    }),
  );

  const errors: SimulationError[] = [];
  const setupStates = new Map<
    number,
    Awaited<ReturnType<typeof runPersonaSetup>>
  >();

  console.log(`[engine] Fase 1/2 — setup sequencial (${users} usuários)`);

  for (const slot of slots) {
    const prefix = formatLogPrefix(slot.index, users, slot.persona);
    const personaDef = getPersona(slot.persona);
    const data = generatedData.personas[slot.persona];

    console.log(`${prefix} Iniciando setup...`);

    try {
      const setup = await runPersonaSetup(
        slot.persona,
        personaDef.behavior,
        slot.apiClient,
        data,
        prefix,
      );
      setupStates.set(slot.index, setup);
      console.log(`${prefix} Setup concluído (${setup.email})`);
    } catch (error) {
      const simulationError = toSimulationError(slot, users, "setup", error);
      errors.push(simulationError);
      console.error(`[engine] ERRO — ${simulationError.message}`);
    }

    if (slot.index < users) {
      await sleep(SETUP_DELAY_BETWEEN_USERS_MS);
    }
  }

  const readySlots = slots.filter((slot) => setupStates.has(slot.index));
  console.log(
    `[engine] Setup finalizado — ${readySlots.length}/${users} prontos para ações`,
  );

  if (readySlots.length === 0) {
    return {
      users: [],
      errors,
      durationMs: Date.now() - startedAt,
    };
  }

  console.log(
    `[engine] Fase 2/2 — ações do dia-a-dia em paralelo (${readySlots.length} usuários)`,
  );

  const dailyResults = await Promise.allSettled(
    readySlots.map(async (slot) => {
      const prefix = formatLogPrefix(slot.index, users, slot.persona);
      const setup = setupStates.get(slot.index);
      if (!setup) {
        throw new Error("Estado de setup ausente");
      }

      const personaDef = getPersona(slot.persona);
      const data = generatedData.personas[slot.persona];

      console.log(`${prefix} Iniciando ações do dia-a-dia...`);
      return runPersonaDailyActions(
        slot.persona,
        personaDef.behavior,
        slot.apiClient,
        data,
        setup,
        prefix,
      );
    }),
  );

  const createdUsers: SimulationUser[] = [];

  for (const [resultIndex, result] of dailyResults.entries()) {
    const slot = readySlots[resultIndex];
    if (!slot) {
      continue;
    }

    if (result.status === "fulfilled") {
      createdUsers.push(result.value);
      console.log(
        `[engine] ${formatLogPrefix(slot.index, users, slot.persona)} — concluído com sucesso`,
      );
      continue;
    }

    const setup = setupStates.get(slot.index);
    const simulationError: SimulationError = {
      index: slot.index,
      persona: slot.persona,
      email: setup?.email,
      phase: "daily",
      message: toSimulationError(slot, users, "daily", result.reason).message,
    };
    errors.push(simulationError);
    console.error(`[engine] ERRO — ${simulationError.message}`);

    if (setup) {
      createdUsers.push({
        persona: setup.persona,
        userId: setup.userId,
        email: setup.email,
        password: setup.password,
        name: setup.name,
        assetIds: setup.assetIds,
      });
    }
  }

  const durationMs = Date.now() - startedAt;
  console.log(
    `[engine] Simulação finalizada em ${(durationMs / 1000).toFixed(1)}s — ` +
      `${createdUsers.length} usuário(s), ${errors.length} erro(s)`,
  );

  return {
    users: createdUsers,
    errors,
    durationMs,
  };
}

function summarizeDistribution(assignments: PersonaType[]): string {
  const counts = assignments.reduce<Record<string, number>>((acc, item) => {
    acc[item] = (acc[item] ?? 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts)
    .map(([name, count]) => `${name}=${count}`)
    .join(", ");
}
