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

To measure how stable the AI review is, use the compare script. It loads the page once and runs only the AI step N times, so page changes don't skew the numbers. For each run it prints the AI-only score, the visual score (AI + measured checks) and the issue titles. At the end it prints min/max/mean, how many issues appeared in every run, and the deterministic non-AI issues:

```bash
pnpm --filter critiq-server compare https://example.com --runs 5 --cold --cache /tmp/example.json
```

- `--cache` saves the captured audit, or loads it if the file already exists. This lets you compare prompt or model changes on exactly the same input.
- `--cold` (Ollama only) unloads the model before each run. **Always use it when measuring variance.** Without it, Ollama's prompt cache makes runs 2..N repeat each other.
- Choose the model per command with `OLLAMA_MODEL=gemma3:12b AI_PROVIDER=ollama pnpm --filter critiq-server compare ...`.

Run it before and after any prompt or provider change.

To try the endpoint directly:

```bash
curl -X POST http://localhost:3001/audit -H "Content-Type: application/json" -d '{"url":"https://example.com"}'
```

## Architecture

A request to `POST /audit` runs two stages:

1. **`src/audit.js` (`runAudit`)**: launches headless Chromium and loads the URL in two contexts, desktop 1440x900 and mobile 390x844 (mobile is touch-enabled at 2x DPR, so the image is 780x1688). It takes a base64 JPEG screenshot of each.
   - **Desktop:** axe-core runs its full default rule set. Those violations get `viewport: "both"`, since the DOM is shared by both viewports.
   - **Mobile:** axe runs only `target-size` (`viewport: "mobile"`). This WCAG 2.2 rule is **disabled by default** in axe 4.13. Enable it with `withRules`; `withTags(['wcag22aa'])` would also turn off every other rule. Tap-target size comes from axe rather than a hand-rolled size check because axe applies the WCAG 2.5.8 spacing and inline-link exceptions.
   - **Mobile:** `src/measure.js` measures visible text below 12px (grouped by font size, punctuation-only text skipped) and horizontal page overflow. Overflow is reported only if the page itself scrolls sideways. The result is stored in `checks`.
   - axe violations are reduced to `{id, impact, help, helpUrl, count, examples[≤5], failureSummary, viewport}`.
2. **`src/ai/index.js` (`analyzeAudit`)**: sends **only the screenshots** to the provider named by `AI_PROVIDER`. The model does a visual and UX review and returns `{ summary, issues }` (`VISUAL_REPORT_SCHEMA`, no score). It then builds the report with the deterministic helpers in `src/ai/normalize.js`:
   - `normalizeAxe` turns axe violations into issues. Impact maps to severity (critical→critical, serious→major, moderate/minor→minor), viewport comes from where the rule ran, `target-size` gets the `responsive` category, the first line of `failureSummary` becomes the suggestion, and `helpUrl` becomes `learnMoreUrl`, which the client renders as a link.
   - `normalizeVisual` folds AI issues whose titles differ only by "desktop"/"mobile" into one `both` issue and caps the count.
   - `normalizeChecks` turns `checks` into issues with fixed severities: small text is minor, horizontal overflow is major.
   - `scoreIssues` is multiplicative: each issue removes a share of the remaining score (critical 15%, major 8%, minor 3%). `score` covers all issues. `scores.visual` applies the same formula to the AI and measured-check issues, and `scores.accessibility` to the axe issues.
   - Each issue is tagged with `source: "ai" | "axe" | "check"`. The prompt tells the model that tap targets, text under 12px and horizontal overflow are already measured, so it doesn't duplicate them. The model's job is only the holistic review that code can't do: visual hierarchy, consistency, how prominent the primary action is, and whether the mobile layout feels designed for a phone.

**Why axe results never go to the model:** with the axe list in the prompt, the 7B Ollama model just paraphrased it, marked everything critical, duplicated each item per viewport and produced no visual findings. Keep that split. The model doesn't set the score either: its own 0-100 score came out as 75 on every Hacker News run. Run-to-run variance comes from the AI issues, since the score is computed from their count and severity. At `temperature: 0.1` with a loose severity definition, example.com scored visual 68-81 over 5 runs and Hacker News produced 13 distinct titles with none in every run. With `temperature: 0`, `seed: 42` and the severity rubric plus "if unsure, don't report it", runs on the same input became nearly identical. The first run after a prompt change sometimes differed. That was suspected to be Ollama's prompt cache, but `--cold` runs, which unload the model each time, were just as stable: example.com gave the same result 5/5 on both models, and Hacker News on qwen gave AI scores of 61 and 64. So per-page determinism is real; the remaining risk is quality, not variance.

**Why the score is multiplicative:** flat points (100 minus 15/8/3 per issue, floored at 0) saturated. Hacker News scored 0 with both models, so a bad page and a terrible page looked the same. With the same issues, the multiplicative score gives Hacker News 35 and example.com 66, where flat points gave 0 and 60. A single issue costs the same under both formulas. Don't switch back to subtracting points.

**Models measured (5 cold runs each):**
- `gemma3:12b` is the default. It takes 27-31s per run and follows the holistic-review focus much better: visual hierarchy, inconsistent arrow placement, login button weight. It still sometimes repeats measured topics, such as reduced font size and an overflow that doesn't exist, and fills the list (7 issues on example.com).
- `qwen2.5vl:7b` takes 17-20s per run warm. It hallucinates on Hacker News ("No upvote arrows visible", "No downvote count visible").

Also beware that extra prompt rules can backfire on small models: "don't put desktop/mobile in the title" made qwen2.5vl use exactly those words as titles.

The response is `{ url, screenshots: {desktop, mobile}, accessibility, checks, report }`, where `report` is `{ score, scores: {visual, accessibility}, summary, issues }`.

### AI providers (`src/ai/providers/`)

Each provider exports `analyze(audit)` and returns the visual review only.

- `mock` is the default. It needs no API key, waits 1.5s and then returns a fixed visual review. Use it for frontend work.
- `ollama` is a local model (`OLLAMA_URL`, `OLLAMA_MODEL`, default `gemma3:12b`). It enforces the schema, including `maxItems`, through Ollama's `format` field, and sets `num_ctx`, `temperature: 0` and `seed` explicitly. An audit takes about 25-30s locally with gemma3:12b.
- `anthropic` uses Claude (`ANTHROPIC_API_KEY`, `CLAUDE_MODEL`). It gets structured output by forcing a `submit_report` tool call whose `input_schema` is `VISUAL_REPORT_SCHEMA`. The client is created lazily so the other providers work without a key. Tool input doesn't enforce array limits, so `normalizeVisual` caps the issue count.

`src/ai/prompt.js` is shared by the real providers: `SYSTEM_PROMPT`, `VISUAL_REPORT_SCHEMA` and `buildUserText`. The prompt asks for a CSS or HTML snippet in backticks in every suggestion; the client renders backtick spans as inline code. There is deliberately no `minItems`: since the score is penalty-based, forcing a minimum would make the model invent issues on clean pages. Images are always passed in the order desktop, then mobile, and the prompt text depends on that order. If you change the report shape, update `src/ai/index.js`, `src/ai/normalize.js`, the mock and `client/src/types/audit.ts` together.

### Client

- The Vite dev server proxies `/api/*` to `localhost:3001` and strips the prefix, so the client calls `/api/audit` and there is no CORS setup. If the server ever needs a production CORS or static-serving setup, keep this path mapping in mind.
- `client/src/types/audit.ts` holds the hand-written TypeScript mirror of the response, including the report built in `src/ai/index.js`. It is not generated, so update it whenever the report shape changes.
- The `@/` alias points to `client/src`. Add shadcn components with `pnpm dlx shadcn@latest add <name>`, run from `client/`.
- `src/hooks/use-audit.ts` is the only place that calls the API. It is a small idle → loading → success/error state machine and aborts any request still in flight.
- `src/components/audit/` holds the audit UI, one component per file. `src/components/theme/` is a light/dark/system theme, stored in localStorage under `critiq-theme`. An inline script in `index.html` applies the theme before first paint, so keep the two in sync.
- Status colors are the `success`, `warning` and `info` tokens in `src/index.css`, with light and dark values; `destructive` is used for critical issues. Use these tokens instead of raw Tailwind palette colors.
- shadcn here uses the **Base UI** flavor (`base-nova`), not Radix. Use the `render` prop instead of `asChild`, and note that ToggleGroup `value` is an array.
- The server is a plain ESM `.js` package with no TypeScript. Its dev script uses `--watch-path=./src` on purpose: with a plain `--watch`, edits under `client/` restart the server on Windows and kill in-flight audits.
