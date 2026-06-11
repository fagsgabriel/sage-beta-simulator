import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isSimulationEmail } from "./personas/utils.js";

export interface SimUserRecord {
  email: string;
  password: string;
  createdAt: string;
}

export interface SimUsersRegistry {
  users: SimUserRecord[];
}

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY_PATH = join(PROJECT_ROOT, "fixtures", "sim-users.json");

function isValidRegistry(data: unknown): data is SimUsersRegistry {
  if (!data || typeof data !== "object") {
    return false;
  }

  const record = data as Record<string, unknown>;
  if (!Array.isArray(record.users)) {
    return false;
  }

  return record.users.every(
    (user) =>
      user &&
      typeof user === "object" &&
      typeof (user as SimUserRecord).email === "string" &&
      typeof (user as SimUserRecord).password === "string" &&
      typeof (user as SimUserRecord).createdAt === "string",
  );
}

export function getRegistryPath(): string {
  return REGISTRY_PATH;
}

export function readSimUsersRegistry(): SimUsersRegistry {
  if (!existsSync(REGISTRY_PATH)) {
    return { users: [] };
  }

  try {
    const raw = readFileSync(REGISTRY_PATH, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    return isValidRegistry(parsed) ? parsed : { users: [] };
  } catch {
    return { users: [] };
  }
}

function writeRegistry(registry: SimUsersRegistry): void {
  const fixturesDir = dirname(REGISTRY_PATH);
  if (!existsSync(fixturesDir)) {
    mkdirSync(fixturesDir, { recursive: true });
  }

  writeFileSync(REGISTRY_PATH, `${JSON.stringify(registry, null, 2)}\n`, "utf-8");
}

/** Registra usuários simulados criados para permitir cleanup posterior. */
export function registerSimUsers(
  users: Array<{ email: string; password: string }>,
): void {
  const registry = readSimUsersRegistry();
  const knownEmails = new Set(registry.users.map((user) => user.email));
  const now = new Date().toISOString();

  for (const user of users) {
    if (!isSimulationEmail(user.email) || knownEmails.has(user.email)) {
      continue;
    }

    registry.users.push({
      email: user.email,
      password: user.password,
      createdAt: now,
    });
    knownEmails.add(user.email);
  }

  writeRegistry(registry);
}

export function removeSimUserFromRegistry(email: string): void {
  const registry = readSimUsersRegistry();
  registry.users = registry.users.filter((user) => user.email !== email);
  writeRegistry(registry);
}

/** Retorna apenas usuários com e-mail de simulação válido. */
export function listRegisteredSimUsers(): SimUserRecord[] {
  return readSimUsersRegistry().users.filter((user) =>
    isSimulationEmail(user.email),
  );
}
