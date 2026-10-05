// Measures how stable the AI review is for one page.
//
//   pnpm --filter critiq-server compare <url> [--runs N] [--cache file.json]
//
// The page is loaded once (screenshots + axe) and only the AI step runs N times,
// so the numbers reflect model variance, not changes on the page. With --cache the
// captured audit is saved to / loaded from a file, so different prompt or model
// settings can be compared on exactly the same input.

import 'dotenv/config';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { runAudit } from '../src/audit.js';
import { analyzeAudit } from '../src/ai/index.js';
import { titleKey } from '../src/ai/normalize.js';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    runs: { type: 'string', default: '5' },
    cache: { type: 'string' },
  },
});

const url = positionals[0];
const runs = Number(values.runs);
if (!url || !Number.isInteger(runs) || runs < 1) {
  console.error('Usage: compare.js <url> [--runs N] [--cache file.json]');
  process.exit(1);
}

const audit = await loadAudit(url, values.cache);
console.log(
  `${audit.url} | provider: ${process.env.AI_PROVIDER || 'mock'} | ${runs} runs | ` +
    `${audit.accessibility.length} axe violations\n`,
);

const results = [];
for (let i = 1; i <= runs; i++) {
  const started = Date.now();
  const report = await analyzeAudit(audit);
  const seconds = (Date.now() - started) / 1000;
  const visual = report.issues.filter((issue) => issue.source === 'ai');
  results.push({ report, visual });

  console.log(
    `Run ${i}: visual ${report.scores.visual}, overall ${report.score}, ` +
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

console.log('\nSummary');
console.log(`  Visual score:  ${stats(results.map((r) => r.report.scores.visual))}`);
console.log(`  Overall score: ${stats(results.map((r) => r.report.score))}`);
console.log(`  AI issues/run: ${stats(results.map((r) => r.visual.length))}`);
console.log(`  Distinct AI issue titles: ${allKeys.size}`);
console.log(`  In every run: ${common.length}${common.length ? ` (${common.join(', ')})` : ''}`);

async function loadAudit(url, cacheFile) {
  if (cacheFile && existsSync(cacheFile)) {
    console.log(`Using cached audit from ${cacheFile}`);
    return JSON.parse(readFileSync(cacheFile, 'utf8'));
  }
  const audit = await runAudit(new URL(url).href);
  if (cacheFile) writeFileSync(cacheFile, JSON.stringify(audit));
  return audit;
}
