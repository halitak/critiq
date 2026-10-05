import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { measureMobile } from './measure.js';

const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 } },
  mobile: {
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  },
};

const NAV_TIMEOUT_MS = 30_000;

export async function runAudit(url) {
  const browser = await chromium.launch();

  try {
    const result = { url, screenshots: {}, accessibility: [], checks: null };

    for (const [name, contextOptions] of Object.entries(VIEWPORTS)) {
      const context = await browser.newContext(contextOptions);
      const page = await context.newPage();

      await page.goto(url, { waitUntil: 'load', timeout: NAV_TIMEOUT_MS });
      // Give late-loading fonts/images a moment to settle
      await page.waitForTimeout(1000);

      const screenshot = await page.screenshot({ type: 'jpeg', quality: 70 });
      result.screenshots[name] = screenshot.toString('base64');

      if (name === 'desktop') {
        // The full rule set is mostly viewport-independent, so it runs once
        const axe = await new AxeBuilder({ page }).analyze();
        result.accessibility.push(...axe.violations.map((v) => toViolation(v, 'both')));
      } else {
        // target-size (WCAG 2.2, 2.5.8) is off by default and matters most on touch screens.
        // withRules runs only this rule, so desktop findings aren't duplicated.
        const axe = await new AxeBuilder({ page }).withRules(['target-size']).analyze();
        result.accessibility.push(...axe.violations.map((v) => toViolation(v, 'mobile')));
        result.checks = await measureMobile(page);
      }

      await context.close();
    }

    return result;
  } finally {
    await browser.close();
  }
}

function toViolation(v, viewport) {
  return {
    id: v.id,
    impact: v.impact,
    help: v.help,
    helpUrl: v.helpUrl,
    count: v.nodes.length,
    // e.g. "Fix any of the following:\n  Element has insufficient color contrast of 2.9 (...)"
    failureSummary: v.nodes[0]?.failureSummary ?? null,
    examples: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
    viewport,
  };
}
