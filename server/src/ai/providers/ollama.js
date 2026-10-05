import { SYSTEM_PROMPT, VISUAL_REPORT_SCHEMA, buildUserText } from '../prompt.js';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const MODEL = process.env.OLLAMA_MODEL || 'qwen2.5vl:7b';

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
      options: { num_ctx: 16384, temperature: 0.1 },
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
