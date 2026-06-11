/**
 * Cliente HTTP autenticado para a API do Sage.
 * Implementação completa em SAG-43.
 */
export class ApiClient {
  constructor(private readonly baseUrl: string) {}

  getBaseUrl(): string {
    return this.baseUrl;
  }
}
