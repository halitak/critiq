export const SYSTEM_PROMPT = `You are a senior UI/UX reviewer auditing a web page.
You get a desktop screenshot, a mobile screenshot and axe-core accessibility violations.

Rules:
- Treat axe-core results as ground truth for accessibility. Do not invent selectors.
- Base visual findings only on what is actually visible in the screenshots.
- Be specific: name the element and where it is ("the hero CTA button", "the footer links").
- Every issue needs a concrete, actionable suggestion.
- Report at most 12 issues, most impactful first. Skip trivial nitpicks.`;

export const REPORT_SCHEMA = {
  type: 'object',
  properties: {
    score: { type: 'integer', minimum: 0, maximum: 100 },
    summary: { type: 'string' },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          severity: { type: 'string', enum: ['critical', 'major', 'minor'] },
          category: {
            type: 'string',
            enum: ['accessibility', 'layout', 'typography', 'color', 'responsive', 'ux'],
          },
          viewport: { type: 'string', enum: ['desktop', 'mobile', 'both'] },
          description: { type: 'string' },
          suggestion: { type: 'string' },
        },
        required: ['title', 'severity', 'category', 'viewport', 'description', 'suggestion'],
      },
    },
  },
  required: ['score', 'summary', 'issues'],
};

export const buildUserText = ({ url, accessibility }) =>
  `Page URL: ${url}
The first image is the desktop screenshot (1440x900), the second is mobile (390x844).

axe-core violations:
${JSON.stringify(accessibility, null, 2)}`;
