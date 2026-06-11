import { randomUUID } from "node:crypto";
import type {
  AssetCategory,
  GeneratedAsset,
  TaskPriority,
} from "../data-generator.js";

export const SIMULATOR_PASSWORD = "SageSim2026!";
export const ACTION_DELAY_MS = 900;

const SIMULATION_EMAIL_PATTERN =
  /^sim-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@sage\.test$/i;

export function isSimulationEmail(email: string): boolean {
  return SIMULATION_EMAIL_PATTERN.test(email);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function actionDelay(): Promise<void> {
  const jitter = Math.floor(Math.random() * 500);
  await sleep(ACTION_DELAY_MS + jitter);
}

export function createSimulatorIdentity(personaLabel: string): {
  email: string;
  password: string;
  name: string;
} {
  const id = randomUUID();
  return {
    email: `sim-${id}@sage.test`,
    password: SIMULATOR_PASSWORD,
    name: `Simulador ${personaLabel}`,
  };
}

export function mapAssetCategory(
  category: AssetCategory,
): "VEHICLE" | "APPLIANCE" | "ELECTRONIC" | "OTHER" {
  switch (category) {
    case "carro":
    case "moto":
      return "VEHICLE";
    case "eletrodomestico":
      return "APPLIANCE";
    default:
      return "OTHER";
  }
}

export function mapMaintenanceType(
  type: "preventive" | "corrective",
): "PREVENTIVE" | "CORRECTIVE" {
  return type === "preventive" ? "PREVENTIVE" : "CORRECTIVE";
}

export function mapTaskPriority(
  priority: TaskPriority,
): "LOW" | "MEDIUM" | "HIGH" {
  switch (priority) {
    case "low":
      return "LOW";
    case "high":
      return "HIGH";
    default:
      return "MEDIUM";
  }
}

export function buildAssetPayload(asset: GeneratedAsset) {
  return {
    name: asset.name,
    category: mapAssetCategory(asset.category),
    description: `${asset.brand} ${asset.model} (${asset.year})`,
    metadata: {
      brand: asset.brand,
      model: asset.model,
      year: asset.year,
      vehicleType: asset.category === "moto" ? "motorcycle" : undefined,
    },
    acquisitionDate: `${asset.year}-06-15`,
  };
}

export function addDays(baseDate: string, days: number): string {
  const date = new Date(`${baseDate}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function shouldAcceptRecommendation(rate: number): boolean {
  return Math.random() < rate;
}
