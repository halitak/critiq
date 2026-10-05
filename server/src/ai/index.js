import * as mock from './providers/mock.js';
import * as ollama from './providers/ollama.js';
import * as anthropic from './providers/anthropic.js';
import { buildReport } from '../report.js';

const providers = { mock, ollama, anthropic };

export async function analyzeAudit(audit) {
  const name = process.env.AI_PROVIDER || 'mock';
  const provider = providers[name];
  if (!provider) throw new Error(`Unknown AI_PROVIDER: ${name}`);

  // Providers return only the visual review (VISUAL_REPORT_SCHEMA)
  const visual = await provider.analyze(audit);
  return buildReport(visual, audit.accessibility);
}
