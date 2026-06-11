import axios, {
  type AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from "axios";

export class AuthRefreshError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AuthRefreshError";
  }
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  plan: "FREE" | "PRO";
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export type AssetCategory =
  | "VEHICLE"
  | "ELECTRONIC"
  | "APPLIANCE"
  | "PROPERTY"
  | "OTHER";

export type MaintenanceType = "PREVENTIVE" | "CORRECTIVE";

export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export type TaskStatus = "PENDING" | "COMPLETED" | "DISMISSED";

export type RecommendationStatus = "PENDING" | "ACCEPTED" | "DISMISSED";

export interface Asset {
  id: string;
  name: string;
  category: AssetCategory;
  healthScore: number;
}

export interface Maintenance {
  id: string;
  assetId: string;
  title: string;
  maintenanceDate: string;
  type: MaintenanceType;
  cost: number;
}

export interface Task {
  id: string;
  assetId: string | null;
  title: string;
  priority: TaskPriority;
  status: TaskStatus;
}

export interface AiRecommendation {
  id: string;
  assetId: string;
  recommendationText: string;
  status: RecommendationStatus;
}

export interface OnboardingChecklistTask {
  title: string;
  description?: string | null;
  recurrenceDays: number;
  executor: "SELF" | "MECHANIC" | "BOTH";
  priority: "LOW" | "MEDIUM" | "HIGH";
}

export type OnboardingChecklistResult =
  | { status: "ok"; source: "ai" | "cached"; tasks: OnboardingChecklistTask[] }
  | { status: "ai_unavailable"; fallback: "static"; message: string };

export type AnalyzeAssetResult =
  | { outcome: "created"; recommendation: AiRecommendation }
  | { outcome: "cached"; recommendation: AiRecommendation; cachedUntil: string }
  | { outcome: "below_threshold"; message: string; confidence: number }
  | { outcome: "ai_unavailable"; message: string };

type RetryableRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean;
};

/**
 * Cliente HTTP autenticado para a API do Sage.
 * Encapsula JWT, refresh automático em 401 e operações de conta.
 */
export class ApiClient {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private refreshPromise: Promise<void> | null = null;
  private readonly http: AxiosInstance;

  constructor(baseUrl?: string) {
    const resolvedBaseUrl = baseUrl ?? process.env.API_URL;
    if (!resolvedBaseUrl) {
      throw new Error("API_URL não definida no ambiente");
    }

    this.http = axios.create({
      baseURL: resolvedBaseUrl.replace(/\/$/, ""),
    });

    this.http.interceptors.request.use((config) => {
      if (this.accessToken) {
        config.headers.Authorization = `Bearer ${this.accessToken}`;
      }
      return config;
    });

    this.http.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as RetryableRequestConfig | undefined;

        if (
          error.response?.status !== 401 ||
          !originalRequest ||
          originalRequest._retry ||
          this.isAuthEndpoint(originalRequest.url)
        ) {
          throw error;
        }

        originalRequest._retry = true;

        try {
          await this.ensureRefreshed();
          return this.http(originalRequest);
        } catch (refreshError) {
          this.clearTokens();
          throw new AuthRefreshError(
            "Sessão expirada: falha ao renovar token de acesso",
            refreshError,
          );
        }
      },
    );
  }

  getBaseUrl(): string {
    return this.http.defaults.baseURL ?? "";
  }

  /** Instância axios para requests autenticadas à API. */
  get client(): AxiosInstance {
    return this.http;
  }

  isAuthenticated(): boolean {
    return this.accessToken !== null;
  }

  async register(
    email: string,
    password: string,
    name: string,
  ): Promise<AuthResponse> {
    const { data } = await this.http.post<AuthResponse>("/auth/register", {
      email,
      password,
      name,
    });
    return this.storeAuthResponse(data);
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    const { data } = await this.http.post<AuthResponse>("/auth/login", {
      email,
      password,
    });
    return this.storeAuthResponse(data);
  }

  async logout(): Promise<void> {
    if (!this.refreshToken) {
      this.clearTokens();
      return;
    }

    try {
      await this.http.post("/auth/logout", {
        refreshToken: this.refreshToken,
      });
    } finally {
      this.clearTokens();
    }
  }

  async deleteAccount(): Promise<void> {
    await this.http.delete("/users/me");
    this.clearTokens();
  }

  async createAsset(input: {
    name: string;
    category: AssetCategory;
    estimatedValue?: number | null;
    acquisitionDate?: string | null;
    description?: string | null;
    metadata?: Record<string, unknown> | null;
    licensePlate?: string | null;
  }): Promise<Asset> {
    const { data } = await this.http.post<Asset>("/assets", input);
    return data;
  }

  async createMaintenance(input: {
    assetId: string;
    title: string;
    description?: string | null;
    cost?: number;
    maintenanceDate: string;
    type: MaintenanceType;
  }): Promise<Maintenance> {
    const { data } = await this.http.post<{ maintenance: Maintenance }>(
      "/maintenances",
      input,
    );
    return data.maintenance;
  }

  async createTask(input: {
    assetId?: string | null;
    title: string;
    description?: string | null;
    priority: TaskPriority;
    dueDate?: string;
    source?: "MANUAL" | "AI" | "MICRO_MAINTENANCE" | "AI_ONBOARDING";
  }): Promise<Task> {
    const { data } = await this.http.post<Task>("/tasks", input);
    return data;
  }

  async bulkCreateTasks(input: {
    source?: "MANUAL" | "AI" | "MICRO_MAINTENANCE" | "AI_ONBOARDING";
    tasks: Array<{
      assetId: string;
      title: string;
      description?: string | null;
      priority?: TaskPriority;
      dueDate?: string | null;
      recurrenceDays: number;
      executor?: "SELF" | "MECHANIC" | "BOTH";
    }>;
  }): Promise<Task[]> {
    const { data } = await this.http.post<Task[]>("/tasks/bulk", input);
    return data;
  }

  async listTasks(params?: {
    status?: TaskStatus;
    asset_id?: string;
  }): Promise<Task[]> {
    const { data } = await this.http.get<{ data: Task[] }>("/tasks", {
      params,
    });
    return data.data;
  }

  async completeTask(taskId: string): Promise<Task> {
    const { data } = await this.http.patch<Task>(
      `/tasks/${taskId}/complete`,
      {},
      { headers: { "Content-Type": "application/json" } },
    );
    return data;
  }

  async generateOnboardingChecklist(
    assetId: string,
  ): Promise<OnboardingChecklistResult> {
    const { data } = await this.http.post<OnboardingChecklistResult>(
      `/ai/onboarding-checklist/${assetId}`,
      {},
      { headers: { "Content-Type": "application/json" } },
    );
    return data;
  }

  async analyzeAsset(assetId: string): Promise<AnalyzeAssetResult> {
    const { data } = await this.http.post<AnalyzeAssetResult>(
      `/ai/analyze/${assetId}`,
      {},
    );
    return data;
  }

  async listRecommendations(): Promise<AiRecommendation[]> {
    const { data } = await this.http.get<AiRecommendation[]>(
      "/ai/recommendations",
    );
    return data;
  }

  async acceptRecommendation(recommendationId: string): Promise<void> {
    await this.http.patch(
      `/ai/recommendations/${recommendationId}/accept`,
      {},
      { headers: { "Content-Type": "application/json" } },
    );
  }

  async dismissRecommendation(recommendationId: string): Promise<void> {
    await this.http.patch(
      `/ai/recommendations/${recommendationId}/dismiss`,
      {},
      { headers: { "Content-Type": "application/json" } },
    );
  }

  async getAssetsSummary(): Promise<{ averageHealthScore: number }> {
    const { data } = await this.http.get<{ averageHealthScore: number }>(
      "/assets/summary",
    );
    return data;
  }

  private storeAuthResponse(data: AuthResponse): AuthResponse {
    this.accessToken = data.accessToken;
    this.refreshToken = data.refreshToken;
    return data;
  }

  private clearTokens(): void {
    this.accessToken = null;
    this.refreshToken = null;
  }

  private isAuthEndpoint(url?: string): boolean {
    if (!url) {
      return false;
    }

    return /\/auth\/(login|register|refresh|logout)(?:\?|$)/.test(url);
  }

  private async refreshTokens(): Promise<void> {
    if (!this.refreshToken) {
      throw new AuthRefreshError(
        "Nenhum refresh token disponível para renovar a sessão",
      );
    }

    const { data } = await axios.post<AuthResponse>(
      `${this.getBaseUrl()}/auth/refresh`,
      { refreshToken: this.refreshToken },
    );

    this.storeAuthResponse(data);
  }

  private async ensureRefreshed(): Promise<void> {
    if (!this.refreshPromise) {
      this.refreshPromise = this.refreshTokens().finally(() => {
        this.refreshPromise = null;
      });
    }

    await this.refreshPromise;
  }
}
