# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Critiq is an AI-powered UI/UX auditor for developers. Given a URL, it screenshots the page and runs accessibility checks, then has a vision model write a structured review. The point of the product is the combination: axe-core catches definite violations, and the model catches what a human reviewer would see (tiny tap targets on mobile, muddled hierarchy). The result is a report sorted by severity.

**MVP scope (deliberately small):** one URL per audit, no accounts or login, no audit history. Don't add these without being asked. Screenshot upload as an alternative input is a possible later feature and is not in the MVP.

**Stack:** React + Vite + TypeScript frontend with Tailwind v4 and shadcn/ui (`client/`), Node + Express backend (`server/`), Playwright, axe-core, Anthropic SDK. Deploy targets are Railway or Render. **Not Vercel or other serverless hosts**, because Playwright needs a full Chromium.

## Commands

This is a pnpm workspace (`server`, `client`). Use pnpm, not npm.

```bash
pnpm install
pnpm --filter critiq-server exec playwright install chromium   # browser binary Playwright needs
cp server/.env.example server/.env
pnpm dev                                    # server (:3001) + client (Vite) in parallel
```

The client also has `pnpm --filter critiq-client build`, which runs `tsc -b` and then the Vite build, and `pnpm --filter critiq-client lint`, which runs oxlint. There is no test suite yet.

To try the endpoint directly:

```bash
curl -X POST http://localhost:3001/audit -H "Content-Type: application/json" -d '{"url":"https://example.com"}'
```

## Architecture

A request to `POST /audit` runs two stages:

1. **`src/audit.js` (`runAudit`)**: launches headless Chromium and loads the URL in two contexts, desktop 1440x900 and mobile 390x844 (mobile is touch-enabled at 2x DPR). It takes a base64 JPEG screenshot of each. axe-core runs **only in the desktop context**, and its violations are reduced to `{id, impact, help, count, examples[≤3]}`.
2. **`src/ai/index.js` (`analyzeAudit`)**: sends that audit to the provider named by `AI_PROVIDER`. Each provider is a module that exports `analyze(audit)` and returns an object matching `REPORT_SCHEMA`.

The response is `{ url, screenshots: {desktop, mobile}, accessibility, report }`.

### AI providers (`src/ai/providers/`)

- `mock` is the default. It needs no API key, waits 1.5s and then returns a fixed report plus up to 3 issues built from the real axe results. Use it for frontend work.
- `ollama` is a local model (`OLLAMA_URL`, `OLLAMA_MODEL`, default `qwen2.5vl:7b`). It enforces the schema through Ollama's `format` field.
- `anthropic` uses Claude (`ANTHROPIC_API_KEY`, `CLAUDE_MODEL`). It gets structured output by forcing a `submit_report` tool call whose `input_schema` is `REPORT_SCHEMA`. The client is created lazily so the other providers work without a key.

`src/ai/prompt.js` is shared by every real provider: `SYSTEM_PROMPT`, `REPORT_SCHEMA` (the API contract for `report`) and `buildUserText`. Images are always passed in the order desktop, then mobile, and the prompt text depends on that order. If you change the report shape, update `REPORT_SCHEMA` and the mock report together, because the frontend will rely on both.

### Client

- The Vite dev server proxies `/api/*` to `localhost:3001` and strips the prefix, so the client calls `/api/audit` and there is no CORS setup. If the server ever needs a production CORS or static-serving setup, keep this path mapping in mind.
- `client/src/types/audit.ts` holds the hand-written TypeScript mirror of the response and of `REPORT_SCHEMA`. It is not generated, so update it whenever the schema changes.
- The `@/` alias points to `client/src`. Add shadcn components with `pnpm dlx shadcn@latest add <name>`, run from `client/`.
- `src/hooks/use-audit.ts` is the only place that calls the API. It is a small idle → loading → success/error state machine and aborts any request still in flight.
- `src/components/audit/` holds the audit UI, one component per file. `src/components/theme/` is a light/dark/system theme, stored in localStorage under `critiq-theme`. An inline script in `index.html` applies the theme before first paint, so keep the two in sync.
- Status colors are the `success`, `warning` and `info` tokens in `src/index.css`, with light and dark values; `destructive` is used for critical issues. Use these tokens instead of raw Tailwind palette colors.
- shadcn here uses the **Base UI** flavor (`base-nova`), not Radix. Use the `render` prop instead of `asChild`, and note that ToggleGroup `value` is an array.
- The server is a plain ESM `.js` package with no TypeScript. Its dev script uses `--watch-path=./src` on purpose: with a plain `--watch`, edits under `client/` restart the server on Windows and kill in-flight audits.
