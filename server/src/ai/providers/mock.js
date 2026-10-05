// Fake visual review for frontend work: free, instant, deterministic.
// axe issues are added by buildReport, same as for the real providers.
export async function analyze() {
  await new Promise((r) => setTimeout(r, 1500)); // simulate latency

  return {
    score: 72,
    summary:
      'Clean overall layout with a clear hierarchy on desktop. The mobile view suffers from small tap targets and the hero text is hard to read against the background.',
    issues: [
      {
        title: 'Low contrast hero text',
        severity: 'critical',
        category: 'color',
        viewport: 'both',
        description: 'The subtitle under the main heading uses light gray on a white background.',
        suggestion: 'Darken the text to at least a 4.5:1 contrast ratio, e.g. #595959 on white.',
      },
      {
        title: 'Tap targets too small on mobile',
        severity: 'major',
        category: 'responsive',
        viewport: 'mobile',
        description: 'Navigation links are packed closely and are smaller than 44x44px.',
        suggestion: 'Increase padding so each link is at least 44x44px, or move them into a menu.',
      },
      {
        title: 'Inconsistent heading sizes',
        severity: 'minor',
        category: 'typography',
        viewport: 'desktop',
        description: 'Section headings use three different font sizes with no clear pattern.',
        suggestion: 'Define a type scale (e.g. 32/24/18px) and apply it consistently.',
      },
    ],
  };
}
