# Critiq

An AI-assisted UI/UX auditor for developers. Give it a URL. It opens the page in a real browser on desktop and mobile, runs automated accessibility and layout checks, and asks a vision model for the review a senior designer would give. You get one report, sorted by severity, with a concrete CSS or HTML fix for each issue.

The combination is the point:

- **Code finds what can be measured:** axe-core violations, tap targets under 24px, text under 12px, horizontal overflow and color contrast. These are definite and identical on every run.
- **The model judges what code can't:** visual hierarchy, consistency, how prominent the primary action is, and whether the mobile layout feels designed for a phone.

## How it works

1. **Capture.** Playwright loads the page at 1440×900 and at 390×844 (touch, 2x). It takes a screenshot of each and runs:
   - axe-core: the full rule set on desktop, and WCAG 2.2 `target-size` on mobile.
   - Measurements in the browser: small text, overflow, and tap targets axe couldn't size.
   - Collection of the page's most used class names and their real colors.
2. **Review.** The vision model gets only the screenshots, the class names and a summary of the measurements. It returns the page's purpose, a summary and up to a few issues.
3. **Validate.** The AI output is checked against the measurements before it reaches the report:
   - Issues that repeat a measured finding are dropped.
   - CSS that wouldn't work is dropped or repaired: flex on table cells, vertical margin on inline elements, colors below WCAG contrast, font sizes below 12px.
   - Severity is capped at major, so only definite automated failures can be critical.

   Dropped issues are kept in the report as `discardedAi`, with the reason.
4. **Score.** Each issue removes a share of the remaining score (critical 15%, major 8%, minor 3%). The overall score is 60% accessibility and 40% visual.

## Stack

- **Client:** React, Vite, TypeScript, Tailwind CSS v4 and shadcn/ui (Base UI).
- **Server:** Node and Express, Playwright, axe-core.
- **AI:** Ollama (local, free) or Anthropic Claude. A mock provider is available for UI work.

## Getting started

Requirements: Node 20.19+ or 22.12+ (what Vite 8 needs), pnpm, and optionally [Ollama](https://ollama.com) for local AI.

```bash
pnpm install
pnpm --filter critiq-server exec playwright install chromium
cp server/.env.example server/.env
pnpm dev
```

Open http://localhost:5173. Vite picks the next free port if 5173 is taken. The API runs on http://localhost:3001.

On Windows PowerShell with script execution disabled, use `pnpm.cmd` instead of `pnpm`.

### Choosing the AI provider

Set `AI_PROVIDER` in `server/.env`:

| Provider | Setup | Notes |
|---|---|---|
| `mock` | none | Instant, fixed review. Use it for frontend work. This is the default when `AI_PROVIDER` is unset. |
| `ollama` | `ollama pull gemma3:12b` | Local and free, about 20s per audit. `OLLAMA_MODEL` selects the model; `gemma3:12b` gave the best results so far. |
| `anthropic` | `ANTHROPIC_API_KEY=...` | Claude via the Anthropic API. `CLAUDE_MODEL` selects the model. |

### API

```bash
curl -X POST http://localhost:3001/audit \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'
```

The response contains the screenshots (base64 JPEG), the raw axe and measurement results, and `report`: `{ score, scores, purpose, summary, issues, discardedAi }`.

## Measuring the AI

`compare` captures a page once and runs only the AI step N times, so you can compare prompts or models on identical input:

```bash
pnpm --filter critiq-server compare https://news.ycombinator.com --runs 3 --cold --cache ./hn.json
```

- It prints scores, issue titles, discarded issues, and counters for bad CSS in suggestions.
- `--cold` unloads the Ollama model before each run.
- `--cache` reuses the same capture across invocations.
- Each run is saved to `server/reports/<model>/<domain>-<timestamp>-<run>.json`.

## Project layout

```
client/                 React app
  src/components/audit/ report UI, one component per file
  src/hooks/use-audit.ts the only API call
  src/types/audit.ts     response types (kept in sync by hand)
server/
  src/audit.js           Playwright capture and axe
  src/measure.js         in-browser measurements
  src/ai/prompt.js       prompt and response schema
  src/ai/normalize.js    turning results into issues, validation, scoring
  src/ai/providers/      mock, ollama, anthropic
  scripts/compare.js     AI stability and quality measurements
```

`CLAUDE.md` documents the design decisions in detail, with the measurements behind them.

## Scope

This is an MVP:

- One URL per audit.
- No accounts.
- No audit history.

Deploy it to a host that can run a full Chromium, such as Railway or Render. Serverless platforms like Vercel won't work with Playwright.
