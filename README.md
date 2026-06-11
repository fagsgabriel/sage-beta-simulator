# Sage Beta Simulator

Simulador de usuários beta para a API do Sage. Gera dados realistas no banco de produção/staging através de personas com comportamentos distintos.

## Pré-requisitos

- Node.js 20+
- npm

## Instalação

```bash
npm install
cp .env.example .env
```

Edite o `.env` com as variáveis necessárias:

| Variável       | Descrição                          |
|----------------|------------------------------------|
| `API_URL`      | URL base da API do Sage            |
| `GROQ_API_KEY` | Chave da API Groq para geração de dados |

## Uso

```bash
npx ts-node src/cli.ts --help
```

## Estrutura do projeto

```
sage-beta-simulator/
├── src/
│   ├── personas/       # Personas de simulação (jovem, adulto, idoso)
│   ├── engine.ts       # Orquestrador de simulação
│   ├── api-client.ts   # Cliente HTTP autenticado
│   ├── data-generator.ts  # Geração de dados via Groq
│   └── cli.ts          # Entrypoint de linha de comando
├── fixtures/           # Cache de dados gerados (não versionado)
├── .env.example
├── package.json
└── tsconfig.json
```

## Issues relacionadas

Este repositório é desenvolvido em fases via Linear (projeto `sage-beta-simulator`):

- **SAG-42** — Setup do repositório (fundação)
- **SAG-43** — API client com JWT
- **SAG-44** — Data generator com Groq
- **SAG-45** — Personas
- **SAG-46** — Engine de simulação
- **SAG-47** — CLI com flags
