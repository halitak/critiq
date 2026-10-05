import * as mock from './providers/mock.js';
import * as ollama from './providers/ollama.js';
import * as anthropic from './providers/anthropic.js';
import { bySeverity, normalizeAxe, normalizeChecks, normalizeVisual, scoreIssues } from './normalize.js';

const providers = { mock, ollama, anthropic };

// The report shape is mirrored by client/src/types/audit.ts (AuditReport)
export async function analyzeAudit(audit) {
  const name = process.env.AI_PROVIDER || 'mock';
  const provider = providers[name];
  if (!provider) throw new Error(`Unknown AI_PROVIDER: ${name}`);

  // Providers only see the screenshots and return { summary, issues } (VISUAL_REPORT_SCHEMA)
  const visual = await provider.analyze(audit);

  // Measured layout checks count as visual; axe (incl. mobile target-size) as accessibility
  const visualIssues = [...normalizeVisual(visual.issues), ...normalizeChecks(audit.checks)];
  const axeIssues = normalizeAxe(audit.accessibility);
  const issues = [...visualIssues, ...axeIssues].sort(bySeverity);

  return {
    score: scoreIssues(issues),
    scores: { visual: scoreIssues(visualIssues), accessibility: scoreIssues(axeIssues) },
    summary: visual.summary,
    issues,
  };
}
