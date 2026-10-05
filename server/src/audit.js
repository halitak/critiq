import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

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
    const result = { url, screenshots: {}, accessibility: [] };

    for (const [name, contextOptions] of Object.entries(VIEWPORTS)) {
      const context = await browser.newContext(contextOptions);
      const page = await context.newPage();

      await page.goto(url, { waitUntil: 'load', timeout: NAV_TIMEOUT_MS });
      // Give late-loading fonts/images a moment to settle
      await page.waitForTimeout(1000);

      const screenshot = await page.screenshot({ type: 'jpeg', quality: 70 });
      result.screenshots[name] = screenshot.toString('base64');

      // axe results are mostly viewport-independent, run once on desktop
      if (name === 'desktop') {
        const axe = await new AxeBuilder({ page }).analyze();
        result.accessibility = axe.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          help: v.help,
          helpUrl: v.helpUrl,
          count: v.nodes.length,
          // e.g. "Fix any of the following:\n  Element has insufficient color contrast of 2.9 (...)"
          failureSummary: v.nodes[0]?.failureSummary ?? null,
          examples: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
        }));
      }

      await context.close();
    }

    return result;
  } finally {
    await browser.close();
  }
}
