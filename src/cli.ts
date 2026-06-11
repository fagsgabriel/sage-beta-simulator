#!/usr/bin/env node
import { Command, InvalidArgumentError } from "commander";
import { runCleanup } from "./cleanup.js";
import { getGeneratedData, loadEnvFile, type PersonaType } from "./data-generator.js";
import { runSimulation, type SimulationResult } from "./engine.js";
import { registerSimUsers } from "./sim-users-registry.js";

const PERSONA_TYPES: PersonaType[] = ["jovem", "adulto", "idoso"];
const DEFAULT_USERS = 3;
const DEFAULT_ENV = "production";

interface CliOptions {
  users: number;
  persona?: PersonaType;
  env: string;
  cleanup?: boolean;
  regenerate?: boolean;
}

function parsePositiveInt(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new InvalidArgumentError("--users deve ser um número inteiro maior que zero");
  }
  return parsed;
}

function parsePersona(value: string): PersonaType {
  if (!PERSONA_TYPES.includes(value as PersonaType)) {
    throw new InvalidArgumentError(
      `--persona inválida: "${value}". Use: ${PERSONA_TYPES.join(", ")}`,
    );
  }
  return value as PersonaType;
}

function usersFlagProvided(argv: string[]): boolean {
  return argv.some((arg) => arg === "--users" || arg.startsWith("--users="));
}

function personaFlagProvided(argv: string[]): boolean {
  return argv.some((arg) => arg === "--persona" || arg.startsWith("--persona="));
}

function formatError(error: unknown): string {
  if (error instanceof InvalidArgumentError) {
    return error.message;
  }

  return error instanceof Error ? error.message : String(error);
}

function printSimulationSummary(result: SimulationResult): void {
  console.log("");
  console.log("── Resumo da simulação ──");
  console.log(`Usuários criados: ${result.users.length}`);
  console.log(`Erros: ${result.errors.length}`);
  console.log(`Tempo total: ${(result.durationMs / 1000).toFixed(1)}s`);

  if (result.users.length > 0) {
    console.log("E-mails:");
    for (const user of result.users) {
      console.log(`  • ${user.email} (${user.persona})`);
    }
  }

  if (result.errors.length > 0) {
    console.log("Falhas:");
    for (const error of result.errors) {
      console.log(`  • ${error.message}`);
    }
  }
}

function printCleanupSummary(
  removed: string[],
  errors: Array<{ email: string; message: string }>,
  durationMs: number,
): void {
  console.log("");
  console.log("── Resumo do cleanup ──");
  console.log(`Usuários removidos: ${removed.length}`);
  console.log(`Erros: ${errors.length}`);
  console.log(`Tempo total: ${(durationMs / 1000).toFixed(1)}s`);

  if (removed.length > 0) {
    console.log("Removidos:");
    for (const email of removed) {
      console.log(`  • ${email}`);
    }
  }

  if (errors.length > 0) {
    console.log("Falhas:");
    for (const error of errors) {
      console.log(`  • ${error.email}: ${error.message}`);
    }
  }
}

async function runRegenerateOnly(): Promise<void> {
  loadEnvFile();
  console.log("[cli] Regenerando cache de dados do Groq...");
  await getGeneratedData({ regenerate: true });
  console.log("[cli] Cache regenerado com sucesso.");
}

async function runSimulationFlow(options: CliOptions): Promise<number> {
  const result = await runSimulation({
    users: options.users,
    persona: options.persona,
    env: options.env,
    regenerate: options.regenerate,
  });

  registerSimUsers(
    result.users.map((user) => ({
      email: user.email,
      password: user.password,
    })),
  );

  printSimulationSummary(result);
  return result.errors.length > 0 ? 1 : 0;
}

async function runCleanupFlow(env: string): Promise<number> {
  const result = await runCleanup({ env });
  printCleanupSummary(result.removed, result.errors, result.durationMs);
  return result.errors.length > 0 ? 1 : 0;
}

async function main(): Promise<void> {
  loadEnvFile();

  const program = new Command();

  program
    .name("sage-beta-simulator")
    .description("Simulador de usuários beta para a API do Sage")
    .version("0.1.0")
    .option(
      "--users <number>",
      "Número de usuários a simular",
      parsePositiveInt,
      DEFAULT_USERS,
    )
    .option(
      "--persona <type>",
      "Persona específica (jovem, adulto, idoso); padrão: todas",
      parsePersona,
    )
    .option(
      "--env <environment>",
      "Ambiente da API (ex.: production)",
      DEFAULT_ENV,
    )
    .option(
      "--cleanup",
      "Remove usuários sim-*@sage.test registrados localmente",
      false,
    )
    .option(
      "--regenerate",
      "Força regeneração do cache Groq (fixtures/generated-data.json)",
      false,
    );

  program.parse();
  const options = program.opts<CliOptions>();
  const argv = process.argv;

  try {
    if (options.cleanup) {
      process.exitCode = await runCleanupFlow(options.env);
      return;
    }

    const regenerateOnly =
      options.regenerate &&
      !usersFlagProvided(argv) &&
      !personaFlagProvided(argv);

    if (regenerateOnly) {
      await runRegenerateOnly();
      return;
    }

    process.exitCode = await runSimulationFlow(options);
  } catch (error) {
    console.error(`[cli] Erro: ${formatError(error)}`);
    process.exitCode = 1;
  }
}

main();
