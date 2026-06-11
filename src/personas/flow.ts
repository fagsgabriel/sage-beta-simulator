import type { ApiClient } from "../api-client.js";
import type { PersonaGeneratedData, PersonaType } from "../data-generator.js";
import type { PersonaBehavior, PersonaExecutionResult } from "./types.js";
import {
  actionDelay,
  addDays,
  buildAssetPayload,
  createSimulatorIdentity,
  mapMaintenanceType,
  mapTaskPriority,
  shouldAcceptRecommendation,
} from "./utils.js";

const MIN_MAINTENANCES_FOR_ANALYSIS = 3;

const PERSONA_LABELS: Record<PersonaType, string> = {
  jovem: "Jovem",
  adulto: "Adulto",
  idoso: "Idoso",
};

export async function runPersonaFlow(
  persona: PersonaType,
  behavior: PersonaBehavior,
  apiClient: ApiClient,
  data: PersonaGeneratedData,
): Promise<PersonaExecutionResult> {
  const identity = createSimulatorIdentity(PERSONA_LABELS[persona]);
  console.log(`[${persona}] Registrando usuário ${identity.email}...`);

  const auth = await apiClient.register(
    identity.email,
    identity.password,
    identity.name,
  );
  await actionDelay();

  const assetIds: string[] = [];
  const manualTaskIds: string[] = [];
  let onboardingTaskIds: string[] = [];

  for (const generatedAsset of data.assets) {
    console.log(`[${persona}] Cadastrando ativo "${generatedAsset.name}"...`);
    const created = await apiClient.createAsset(buildAssetPayload(generatedAsset));
    assetIds.push(created.id);
    await actionDelay();

    if (behavior.acceptOnboardingChecklist) {
      console.log(`[${persona}] Gerando checklist de onboarding...`);
      const checklist = await apiClient.generateOnboardingChecklist(created.id);
      await actionDelay();

      if (checklist.status === "ok" && checklist.tasks.length > 0) {
        const today = new Date().toISOString().slice(0, 10);
        const tasks = await apiClient.bulkCreateTasks({
          source: "AI_ONBOARDING",
          tasks: checklist.tasks.map((task) => ({
            assetId: created.id,
            title: task.title,
            description: task.description ?? null,
            priority: task.priority,
            recurrenceDays: task.recurrenceDays,
            dueDate: addDays(today, task.recurrenceDays),
            executor: task.executor,
          })),
        });
        onboardingTaskIds = onboardingTaskIds.concat(tasks.map((task) => task.id));
        console.log(`[${persona}] Checklist aceito (${tasks.length} tasks).`);
        await actionDelay();
      } else {
        console.log(`[${persona}] Checklist indisponível — seguindo sem onboarding.`);
      }
    }
  }

  for (const maintenance of data.maintenances) {
    const assetId = assetIds[maintenance.assetIndex];
    if (!assetId) {
      throw new Error(
        `Manutenção referencia assetIndex inválido: ${maintenance.assetIndex}`,
      );
    }

    console.log(`[${persona}] Registrando manutenção "${maintenance.description}"...`);
    await apiClient.createMaintenance({
      assetId,
      title: maintenance.description,
      description: maintenance.description,
      cost: maintenance.cost,
      maintenanceDate: maintenance.date,
      type: mapMaintenanceType(maintenance.type),
    });
    await actionDelay();
  }

  for (const task of data.tasks) {
    const assetId = assetIds[task.assetIndex];
    if (!assetId) {
      throw new Error(`Task referencia assetIndex inválido: ${task.assetIndex}`);
    }

    const dueDate =
      task.ignoredWeeks !== undefined
        ? addDays(new Date().toISOString().slice(0, 10), -task.ignoredWeeks * 7)
        : addDays(new Date().toISOString().slice(0, 10), 14);

    console.log(`[${persona}] Criando task manual "${task.title}"...`);
    const created = await apiClient.createTask({
      assetId,
      title: task.title,
      description: task.description,
      priority: mapTaskPriority(task.priority),
      dueDate,
      source: "MANUAL",
    });
    manualTaskIds.push(created.id);
    await actionDelay();
  }

  if (data.maintenances.length >= MIN_MAINTENANCES_FOR_ANALYSIS) {
    const primaryAssetId = assetIds[0];
    if (primaryAssetId) {
      console.log(`[${persona}] Solicitando análise de IA do ativo principal...`);
      try {
        await apiClient.analyzeAsset(primaryAssetId);
      } catch {
        console.log(`[${persona}] Análise de IA indisponível — seguindo com recomendações existentes.`);
      }
      await actionDelay();
    }
  }

  const recommendations = await apiClient.listRecommendations();
  const pending = recommendations.filter((item) => item.status === "PENDING");

  for (const recommendation of pending) {
    const accept = shouldAcceptRecommendation(behavior.recommendationAcceptRate);
    console.log(
      `[${persona}] ${accept ? "Aceitando" : "Dispensando"} recomendação ${recommendation.id}...`,
    );

    if (accept) {
      await apiClient.acceptRecommendation(recommendation.id);
    } else {
      await apiClient.dismissRecommendation(recommendation.id);
    }
    await actionDelay();
  }

  await simulateRecentActivity(
    persona,
    apiClient,
    behavior,
    manualTaskIds,
    onboardingTaskIds,
  );

  const summary = await apiClient.getAssetsSummary();
  console.log(
    `[${persona}] Fluxo concluído — health score médio: ${summary.averageHealthScore.toFixed(1)}`,
  );

  return {
    persona,
    userId: auth.user.id,
    email: identity.email,
    password: identity.password,
    name: identity.name,
    assetIds,
  };
}

async function simulateRecentActivity(
  persona: PersonaType,
  apiClient: ApiClient,
  behavior: PersonaBehavior,
  manualTaskIds: string[],
  onboardingTaskIds: string[],
): Promise<void> {
  console.log(`[${persona}] Simulando atividade recente...`);
  await apiClient.getAssetsSummary();
  await actionDelay();

  if (behavior.completeOnboardingTasks && onboardingTaskIds.length > 0) {
    const taskId = onboardingTaskIds[0];
    console.log(`[${persona}] Concluindo task de onboarding ${taskId}...`);
    await apiClient.completeTask(taskId);
    await actionDelay();
  }

  if (behavior.completeManualTasks && manualTaskIds.length > 0) {
    const taskId = manualTaskIds[0];
    console.log(`[${persona}] Concluindo task manual ${taskId}...`);
    await apiClient.completeTask(taskId);
    await actionDelay();
  }

  if (!behavior.completeManualTasks) {
    const pending = await apiClient.listTasks({ status: "PENDING" });
    console.log(`[${persona}] ${pending.length} tasks pendentes (não concluídas).`);
    await actionDelay();
  }
}
