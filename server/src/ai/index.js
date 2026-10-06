import * as mock from './providers/mock.js';
import * as ollama from './providers/ollama.js';
import * as anthropic from './providers/anthropic.js';
import { bySeverity, normalizeAxe, normalizeChecks, normalizeTargets, normalizeVisual, scoreIssues } from './normalize.js';

const providers = { mock, ollama, anthropic };

// Accessibility weighs more: axe findings are definite, AI findings are judgment calls
const WEIGHTS = { accessibility: 0.6, visual: 0.4 };

/** Weighted average of the sub-scores, so it always lies between them */
export const overallScore = ({ visual, accessibility }) =>
  Math.round(WEIGHTS.accessibility * accessibility + WEIGHTS.visual * visual);

// The report shape is mirrored by client/src/types/audit.ts (AuditReport)
export async function analyzeAudit(audit) {
  const name = process.env.AI_PROVIDER || 'mock';
  const provider = providers[name];
  if (!provider) throw new Error(`Unknown AI_PROVIDER: ${name}`);

  // Providers only see the screenshots (plus class names) and return
  // { purpose, summary, issues } (VISUAL_REPORT_SCHEMA)
  const visual = await provider.analyze(audit);

  // Deterministic issues first: AI issues are validated against them.
  // Measured layout checks count as visual; axe and tap targets (WCAG 2.5.8) as accessibility.
  const checkIssues = normalizeChecks(audit.checks);
  const axeIssues = [...normalizeAxe(audit.accessibility), ...normalizeTargets(audit.checks?.smallTargets)];
  const { issues: aiIssues, discarded } = normalizeVisual(visual.issues, audit, [...axeIssues, ...checkIssues]);

  const visualIssues = [...aiIssues, ...checkIssues];
  const issues = [...visualIssues, ...axeIssues].sort(bySeverity);

  const scores = { visual: scoreIssues(visualIssues), accessibility: scoreIssues(axeIssues) };

  return {
    score: overallScore(scores),
    scores,
    purpose: visual.purpose,
    summary: visual.summary,
    issues,
    // AI issues that didn't make it, with the reason; not shown in the UI
    discardedAi: discarded,
  };
}
