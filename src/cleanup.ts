import { ApiClient } from "./api-client.js";
import { loadEnvFile } from "./data-generator.js";
import { resolveApiUrl } from "./engine.js";
import {
  listRegisteredSimUsers,
  removeSimUserFromRegistry,
  type SimUserRecord,
} from "./sim-users-registry.js";

export interface CleanupError {
  email: string;
  message: string;
}

export interface CleanupResult {
  removed: string[];
  errors: CleanupError[];
  durationMs: number;
}

export interface CleanupOptions {
  env: string;
}

function formatCleanupError(email: string, error: unknown): CleanupError {
  const message = error instanceof Error ? error.message : String(error);
  return { email, message };
}

async function deleteSimUser(
  apiUrl: string,
  user: SimUserRecord,
): Promise<void> {
  const apiClient = new ApiClient(apiUrl);
  await apiClient.login(user.email, user.password);
  await apiClient.deleteAccount();
}

/**
 * Remove usuários de simulação registrados localmente.
 * Apenas e-mails `sim-*@sage.test` são processados — dados reais não são afetados.
 */
export async function runCleanup(
  options: CleanupOptions,
): Promise<CleanupResult> {
  const startedAt = Date.now();
  loadEnvFile();

  const apiUrl = resolveApiUrl(options.env);
  const simUsers = listRegisteredSimUsers();

  console.log(`[cleanup] Ambiente: ${options.env} (${apiUrl})`);
  console.log(
    `[cleanup] ${simUsers.length} usuário(s) de simulação registrado(s)`,
  );

  if (simUsers.length === 0) {
    console.log("[cleanup] Nenhum usuário para remover.");
    return {
      removed: [],
      errors: [],
      durationMs: Date.now() - startedAt,
    };
  }

  const removed: string[] = [];
  const errors: CleanupError[] = [];

  for (const user of simUsers) {
    console.log(`[cleanup] Removendo ${user.email}...`);

    try {
      await deleteSimUser(apiUrl, user);
      removeSimUserFromRegistry(user.email);
      removed.push(user.email);
      console.log(`[cleanup] ${user.email} removido com sucesso.`);
    } catch (error) {
      const cleanupError = formatCleanupError(user.email, error);
      errors.push(cleanupError);
      console.error(`[cleanup] ERRO — ${user.email}: ${cleanupError.message}`);
    }
  }

  const durationMs = Date.now() - startedAt;
  console.log(
    `[cleanup] Finalizado em ${(durationMs / 1000).toFixed(1)}s — ` +
      `${removed.length} removido(s), ${errors.length} erro(s)`,
  );

  return { removed, errors, durationMs };
}
