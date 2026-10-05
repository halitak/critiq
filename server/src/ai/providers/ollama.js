import { SYSTEM_PROMPT, VISUAL_REPORT_SCHEMA, buildUserText } from '../prompt.js';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
export const MODEL = process.env.OLLAMA_MODEL || 'gemma3:12b';

/**
 * Evicts the model from memory so the next request starts like a fresh audit
 * (model load, empty prompt cache). Used by scripts/compare.js --cold.
 */
export async function unload() {
  await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    body: JSON.stringify({ model: MODEL, keep_alive: 0 }),
  });
  // Unloading finishes in the background; wait until the model leaves /api/ps
  for (let i = 0; i < 100; i++) {
    const { models } = await (await fetch(`${OLLAMA_URL}/api/ps`)).json();
    if (!models.some((m) => m.name === MODEL)) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Ollama did not unload ${MODEL}`);
}

export async function analyze(audit) {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      // Ollama constrains the output to this JSON schema
      format: VISUAL_REPORT_SCHEMA,
      // Set explicitly so results don't depend on the Ollama server's defaults.
      // Two screenshots take ~3.5k tokens; a small default context would cut them off.
      // Greedy decoding + fixed seed keep runs as repeatable as the GPU allows
      // (measure with `pnpm --filter critiq-server compare <url> --runs N`).
      options: { num_ctx: 16384, temperature: 0, seed: 42 },
      messages: [
        {
          role: 'system',
          content: `${SYSTEM_PROMPT}\nRespond only with JSON.`,
        },
        {
          role: 'user',
          content: buildUserText(audit),
          images: [audit.screenshots.desktop, audit.screenshots.mobile],
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`Ollama error ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  return JSON.parse(data.message.content);
}
