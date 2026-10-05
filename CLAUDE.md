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

A request to `POST /audit` runs three stages:

1. **`src/audit.js` (`runAudit`)**: launches headless Chromium and loads the URL in two contexts, desktop 1440x900 and mobile 390x844 (mobile is touch-enabled at 2x DPR, so the image is 780x1688). It takes a base64 JPEG screenshot of each. axe-core runs **only in the desktop context**, and its violations are reduced to `{id, impact, help, helpUrl, count, examples[≤3], failureSummary}`.
2. **`src/ai/index.js` (`analyzeAudit`)**: sends **only the screenshots** to the provider named by `AI_PROVIDER`. The model does a visual and UX review and returns `VISUAL_REPORT_SCHEMA`.
3. **`src/report.js` (`buildReport`)**: merges the visual review with the axe results in code.
   - axe violations become issues deterministically: impact maps to severity, and the first line of `failureSummary` becomes the suggestion.
   - AI issues whose titles differ only by "desktop"/"mobile" are folded into one `both` issue.
   - The overall score is 60% the AI's visual score plus 40% an accessibility score, which is 100 minus a penalty for each axe impact.
   - Each issue is tagged with `source: "ai" | "axe"`.

**Why axe results never go to the model:** with the axe list in the prompt, the 7B Ollama model just paraphrased it, marked everything critical, duplicated each item per viewport and produced no visual findings. Keep that split. Also beware that extra prompt rules can backfire on the 7B model: "don't put desktop/mobile in the title" made it use exactly those words as titles.

The response is `{ url, screenshots: {desktop, mobile}, accessibility, report }`, where `report` is `{ score, scores: {visual, accessibility}, summary, issues }`.

### AI providers (`src/ai/providers/`)

Each provider exports `analyze(audit)` and returns the visual review only.

- `mock` is the default. It needs no API key, waits 1.5s and then returns a fixed visual review. Use it for frontend work.
- `ollama` is a local model (`OLLAMA_URL`, `OLLAMA_MODEL`, default `qwen2.5vl:7b`). It enforces the schema, including `minItems` and `maxItems`, through Ollama's `format` field, and sets `num_ctx` and `temperature` explicitly. An audit takes about 15-35s locally.
- `anthropic` uses Claude (`ANTHROPIC_API_KEY`, `CLAUDE_MODEL`). It gets structured output by forcing a `submit_report` tool call whose `input_schema` is `VISUAL_REPORT_SCHEMA`. The client is created lazily so the other providers work without a key. Tool input doesn't enforce array limits, so `buildReport` caps the issue count.

`src/ai/prompt.js` is shared by the real providers: `SYSTEM_PROMPT`, `VISUAL_REPORT_SCHEMA` and `buildUserText`. Images are always passed in the order desktop, then mobile, and the prompt text depends on that order. If you change the report shape, update `buildReport`, the mock and `client/src/types/audit.ts` together.

### Client

- The Vite dev server proxies `/api/*` to `localhost:3001` and strips the prefix, so the client calls `/api/audit` and there is no CORS setup. If the server ever needs a production CORS or static-serving setup, keep this path mapping in mind.
- `client/src/types/audit.ts` holds the hand-written TypeScript mirror of the response, including `buildReport`'s output. It is not generated, so update it whenever the report shape changes.
- The `@/` alias points to `client/src`. Add shadcn components with `pnpm dlx shadcn@latest add <name>`, run from `client/`.
- `src/hooks/use-audit.ts` is the only place that calls the API. It is a small idle → loading → success/error state machine and aborts any request still in flight.
- `src/components/audit/` holds the audit UI, one component per file. `src/components/theme/` is a light/dark/system theme, stored in localStorage under `critiq-theme`. An inline script in `index.html` applies the theme before first paint, so keep the two in sync.
- Status colors are the `success`, `warning` and `info` tokens in `src/index.css`, with light and dark values; `destructive` is used for critical issues. Use these tokens instead of raw Tailwind palette colors.
- shadcn here uses the **Base UI** flavor (`base-nova`), not Radix. Use the `render` prop instead of `asChild`, and note that ToggleGroup `value` is an array.
- The server is a plain ESM `.js` package with no TypeScript. Its dev script uses `--watch-path=./src` on purpose: with a plain `--watch`, edits under `client/` restart the server on Windows and kill in-flight audits.
