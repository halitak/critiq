// Measures how stable the AI review is for one page.
//
//   pnpm --filter critiq-server compare <url> [--runs N] [--cache file.json] [--cold]
//
// The page is loaded once (screenshots + axe) and only the AI step runs N times,
// so the numbers reflect model variance, not changes on the page. With --cache the
// captured audit is saved to / loaded from a file, so different prompt or model
// settings can be compared on exactly the same input.
//
// --cold (Ollama only) unloads the model before every run, so each run starts like a
// real audit instead of reusing Ollama's prompt cache for the identical screenshots.
// In practice cold and warm runs were equally stable, but cold rules the cache out
// and its timings include model loading.
// Pick the model with OLLAMA_MODEL=... in front of the command.

import 'dotenv/config';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { runAudit } from '../src/audit.js';
import { analyzeAudit } from '../src/ai/index.js';
import { scoreIssues, titleKey } from '../src/ai/normalize.js';
import * as ollama from '../src/ai/providers/ollama.js';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    runs: { type: 'string', default: '5' },
    cache: { type: 'string' },
    cold: { type: 'boolean', default: false },
  },
});

const url = positionals[0];
const runs = Number(values.runs);
if (!url || !Number.isInteger(runs) || runs < 1) {
  console.error('Usage: compare.js <url> [--runs N] [--cache file.json] [--cold]');
  process.exit(1);
}

const provider = process.env.AI_PROVIDER || 'mock';
if (values.cold && provider !== 'ollama') {
  console.error('--cold only applies to AI_PROVIDER=ollama');
  process.exit(1);
}

const audit = await loadAudit(url, values.cache);
const model = provider === 'ollama' ? ` (${ollama.MODEL})` : '';
console.log(
  `${audit.url} | provider: ${provider}${model} | ${runs} ${values.cold ? 'cold ' : ''}runs | ` +
    `${audit.accessibility.length} axe violations\n`,
);

const results = [];
for (let i = 1; i <= runs; i++) {
  if (values.cold) await ollama.unload();
  // With --cold this includes loading the model
  const started = Date.now();
  const report = await analyzeAudit(audit);
  const seconds = (Date.now() - started) / 1000;
  const visual = report.issues.filter((issue) => issue.source === 'ai');
  // scores.visual also includes measured checks; this isolates the model's contribution
  const aiScore = scoreIssues(visual);
  results.push({ report, visual, aiScore, seconds });

  console.log(
    `Run ${i}: AI ${aiScore}, visual ${report.scores.visual}, overall ${report.score}, ` +
      `${visual.length} AI issues (${seconds.toFixed(1)}s)`,
  );
  for (const issue of visual) console.log(`  - [${issue.severity}] ${issue.title}`);
}

const stats = (nums) => {
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  return `min ${Math.min(...nums)}, max ${Math.max(...nums)}, mean ${mean.toFixed(1)}`;
};

// An issue counts as "common" when a run-independent title key shows up in every run
const keysPerRun = results.map(({ visual }) => new Set(visual.map((issue) => titleKey(issue.title))));
const allKeys = new Set(keysPerRun.flatMap((keys) => [...keys]));
const common = [...allKeys].filter((key) => keysPerRun.every((keys) => keys.has(key)));

// axe and measured-check issues don't depend on the model, so one run shows them all
const fixed = results[0].report.issues.filter((issue) => issue.source !== 'ai');
console.log(`\nNon-AI issues (identical every run): ${fixed.length}`);
for (const issue of fixed) {
  console.log(`  - [${issue.source} ${issue.severity}/${issue.viewport}] ${issue.title}`);
  // Mobile-only findings (target-size, measured checks) are the ones worth eyeballing
  if (issue.viewport === 'mobile') {
    console.log(`      ${issue.description}`);
  }
}

console.log('\nSummary');
console.log(`  AI score:      ${stats(results.map((r) => r.aiScore))}`);
console.log(`  Visual score:  ${stats(results.map((r) => r.report.scores.visual))}`);
console.log(`  Overall score: ${stats(results.map((r) => r.report.score))}`);
console.log(`  AI issues/run: ${stats(results.map((r) => r.visual.length))}`);
console.log(`  Distinct AI issue titles: ${allKeys.size}`);
console.log(`  In every run: ${common.length}${common.length ? ` (${common.join(', ')})` : ''}`);
console.log(`  Seconds/run:   ${stats(results.map((r) => Math.round(r.seconds)))}`);

async function loadAudit(url, cacheFile) {
  if (cacheFile && existsSync(cacheFile)) {
    console.log(`Using cached audit from ${cacheFile}`);
    return JSON.parse(readFileSync(cacheFile, 'utf8'));
  }
  const audit = await runAudit(new URL(url).href);
  if (cacheFile) writeFileSync(cacheFile, JSON.stringify(audit));
  return audit;
}
