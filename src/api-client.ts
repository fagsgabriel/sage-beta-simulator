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
