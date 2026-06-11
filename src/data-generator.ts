import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Groq from "groq-sdk";

export type PersonaType = "jovem" | "adulto" | "idoso";

export type AssetCategory = "carro" | "moto" | "eletrodomestico";

export type MaintenanceType = "preventive" | "corrective";

export type TaskPriority = "low" | "medium" | "high";

export interface GeneratedAsset {
  name: string;
  category: AssetCategory;
  brand: string;
  model: string;
  year: number;
}

export interface GeneratedMaintenance {
  assetIndex: number;
  description: string;
  type: MaintenanceType;
  cost: number;
  date: string;
}

export interface GeneratedTask {
  assetIndex: number;
  title: string;
  description: string;
  priority: TaskPriority;
  ignoredWeeks?: number;
}

export interface PersonaGeneratedData {
  assets: GeneratedAsset[];
  maintenances: GeneratedMaintenance[];
  tasks: GeneratedTask[];
}

export interface GeneratedDataCache {
  generatedAt: string;
  personas: Record<PersonaType, PersonaGeneratedData>;
}

export interface DataGeneratorOptions {
  regenerate?: boolean;
}

const PERSONA_TYPES: PersonaType[] = ["jovem", "adulto", "idoso"];
const GROQ_DELAY_MS = 15_000;
const GROQ_MODEL = "llama-3.3-70b-versatile";

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE_PATH = join(PROJECT_ROOT, "fixtures", "generated-data.json");

const PERSONA_PROMPTS: Record<PersonaType, string> = {
  jovem: `Gere dados realistas em português do Brasil para um usuário jovem que gerencia um veículo próprio.
Requisitos:
- 1 ativo: moto OU carro popular com até 5 anos de uso
- 2 ou 3 manutenções corretivas com custo baixo (R$ 80 a R$ 400)
- 2 tasks manuais simples
- Datas de manutenção distribuídas nos últimos 12 meses; a mais recente nos últimos 30 dias
- Use marcas e modelos comuns no Brasil`,

  adulto: `Gere dados realistas em português do Brasil para um usuário adulto com rotina organizada.
Requisitos:
- 2 ativos: 1 carro + 1 eletrodoméstico (ex.: geladeira, máquina de lavar)
- 4 ou 5 manutenções mistas (preventiva e corretiva) com custo médio (R$ 150 a R$ 900)
- 3 tasks com prioridades variadas (low, medium, high)
- Datas de manutenção distribuídas nos últimos 12 meses, com atividade recente
- Use marcas e modelos comuns no Brasil`,

  idoso: `Gere dados realistas em português do Brasil para um usuário idoso com carro antigo.
Requisitos:
- 1 ativo: carro com 10 anos ou mais
- 3 ou 4 manutenções corretivas esporádicas com custo alto (R$ 400 a R$ 2.500)
- 1 ou 2 tasks que ficaram ignoradas por semanas (campo ignoredWeeks entre 2 e 8)
- A manutenção mais recente deve ter mais de 60 dias
- Use marcas e modelos comuns no Brasil`,
};

const JSON_SCHEMA_INSTRUCTION = `Responda APENAS com JSON válido no formato:
{
  "assets": [
    {
      "name": "string",
      "category": "carro" | "moto" | "eletrodomestico",
      "brand": "string",
      "model": "string",
      "year": number
    }
  ],
  "maintenances": [
    {
      "assetIndex": number,
      "description": "string",
      "type": "preventive" | "corrective",
      "cost": number,
      "date": "YYYY-MM-DD"
    }
  ],
  "tasks": [
    {
      "assetIndex": number,
      "title": "string",
      "description": "string",
      "priority": "low" | "medium" | "high",
      "ignoredWeeks": number (opcional, apenas para tasks ignoradas)
    }
  ]
}`;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadEnvFile(): void {
  const envPath = join(PROJECT_ROOT, ".env");
  if (!existsSync(envPath)) {
    return;
  }

  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function getGroqClient(): Groq {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY não definida no ambiente");
  }

  return new Groq({ apiKey });
}

function isPersonaType(value: string): value is PersonaType {
  return PERSONA_TYPES.includes(value as PersonaType);
}

function isAssetCategory(value: string): value is AssetCategory {
  return value === "carro" || value === "moto" || value === "eletrodomestico";
}

function isMaintenanceType(value: string): value is MaintenanceType {
  return value === "preventive" || value === "corrective";
}

function isTaskPriority(value: string): value is TaskPriority {
  return value === "low" || value === "medium" || value === "high";
}

function assertPersonaData(
  data: unknown,
  persona: PersonaType,
): asserts data is PersonaGeneratedData {
  if (!data || typeof data !== "object") {
    throw new Error(`Resposta inválida do Groq para persona "${persona}"`);
  }

  const record = data as Record<string, unknown>;
  if (!Array.isArray(record.assets) || record.assets.length === 0) {
    throw new Error(`Persona "${persona}": assets ausente ou vazio`);
  }

  if (!Array.isArray(record.maintenances) || record.maintenances.length === 0) {
    throw new Error(`Persona "${persona}": maintenances ausente ou vazio`);
  }

  if (!Array.isArray(record.tasks) || record.tasks.length === 0) {
    throw new Error(`Persona "${persona}": tasks ausente ou vazio`);
  }

  for (const asset of record.assets) {
    if (!asset || typeof asset !== "object") {
      throw new Error(`Persona "${persona}": asset inválido`);
    }

    const item = asset as Record<string, unknown>;
    if (typeof item.name !== "string" || !isAssetCategory(String(item.category))) {
      throw new Error(`Persona "${persona}": asset com campos inválidos`);
    }

    if (
      typeof item.brand !== "string" ||
      typeof item.model !== "string" ||
      typeof item.year !== "number"
    ) {
      throw new Error(`Persona "${persona}": asset com metadados inválidos`);
    }
  }

  for (const maintenance of record.maintenances) {
    if (!maintenance || typeof maintenance !== "object") {
      throw new Error(`Persona "${persona}": manutenção inválida`);
    }

    const item = maintenance as Record<string, unknown>;
    if (
      typeof item.assetIndex !== "number" ||
      typeof item.description !== "string" ||
      !isMaintenanceType(String(item.type)) ||
      typeof item.cost !== "number" ||
      typeof item.date !== "string"
    ) {
      throw new Error(`Persona "${persona}": manutenção com campos inválidos`);
    }
  }

  for (const task of record.tasks) {
    if (!task || typeof task !== "object") {
      throw new Error(`Persona "${persona}": task inválida`);
    }

    const item = task as Record<string, unknown>;
    if (
      typeof item.assetIndex !== "number" ||
      typeof item.title !== "string" ||
      typeof item.description !== "string" ||
      !isTaskPriority(String(item.priority))
    ) {
      throw new Error(`Persona "${persona}": task com campos inválidos`);
    }

    if (
      item.ignoredWeeks !== undefined &&
      typeof item.ignoredWeeks !== "number"
    ) {
      throw new Error(`Persona "${persona}": ignoredWeeks inválido`);
    }
  }
}

function isValidCache(data: unknown): data is GeneratedDataCache {
  if (!data || typeof data !== "object") {
    return false;
  }

  const record = data as Record<string, unknown>;
  if (typeof record.generatedAt !== "string" || !record.personas) {
    return false;
  }

  if (typeof record.personas !== "object" || record.personas === null) {
    return false;
  }

  const personas = record.personas as Record<string, unknown>;
  for (const persona of PERSONA_TYPES) {
    try {
      assertPersonaData(personas[persona], persona);
    } catch {
      return false;
    }
  }

  return true;
}

export function getCachePath(): string {
  return CACHE_PATH;
}

export function readCache(): GeneratedDataCache | null {
  if (!existsSync(CACHE_PATH)) {
    return null;
  }

  try {
    const raw = readFileSync(CACHE_PATH, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    return isValidCache(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeCache(cache: GeneratedDataCache): void {
  const fixturesDir = dirname(CACHE_PATH);
  if (!existsSync(fixturesDir)) {
    mkdirSync(fixturesDir, { recursive: true });
  }

  writeFileSync(CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`, "utf-8");
}

async function generatePersonaData(
  groq: Groq,
  persona: PersonaType,
): Promise<PersonaGeneratedData> {
  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,
    temperature: 0.8,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Você gera dados fictícios plausíveis para simulação de um app de gestão de ativos e manutenções no Brasil.",
      },
      {
        role: "user",
        content: `${PERSONA_PROMPTS[persona]}\n\n${JSON_SCHEMA_INSTRUCTION}`,
      },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error(`Groq retornou resposta vazia para persona "${persona}"`);
  }

  const parsed: unknown = JSON.parse(content);
  assertPersonaData(parsed, persona);
  return parsed;
}

async function generateAllPersonas(): Promise<GeneratedDataCache> {
  const groq = getGroqClient();
  const personas = {} as Record<PersonaType, PersonaGeneratedData>;

  for (const [index, persona] of PERSONA_TYPES.entries()) {
    if (index > 0) {
      console.log(`Aguardando ${GROQ_DELAY_MS / 1000}s antes da próxima chamada Groq...`);
      await sleep(GROQ_DELAY_MS);
    }

    console.log(`Gerando dados para persona "${persona}" via Groq...`);
    personas[persona] = await generatePersonaData(groq, persona);
  }

  const cache: GeneratedDataCache = {
    generatedAt: new Date().toISOString(),
    personas,
  };

  writeCache(cache);
  console.log(`Cache salvo em ${CACHE_PATH}`);
  return cache;
}

export async function getGeneratedData(
  options: DataGeneratorOptions = {},
): Promise<GeneratedDataCache> {
  const cached = readCache();

  if (!options.regenerate && cached) {
    console.log("Lendo dados do cache (fixtures/generated-data.json)");
    return cached;
  }

  if (options.regenerate) {
    console.log("Flag --regenerate ativa: ignorando cache");
  }

  return generateAllPersonas();
}

export async function getPersonaData(
  persona: PersonaType,
  options: DataGeneratorOptions = {},
): Promise<PersonaGeneratedData> {
  if (!isPersonaType(persona)) {
    throw new Error(`Persona inválida: ${persona}`);
  }

  const cache = await getGeneratedData(options);
  return cache.personas[persona];
}

function parseCliArgs(argv: string[]): DataGeneratorOptions {
  return {
    regenerate: argv.includes("--regenerate"),
  };
}

async function runCli(): Promise<void> {
  loadEnvFile();
  const options = parseCliArgs(process.argv.slice(2));
  await getGeneratedData(options);
}

const isMainModule =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isMainModule) {
  runCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Erro ao gerar dados: ${message}`);
    process.exitCode = 1;
  });
}
