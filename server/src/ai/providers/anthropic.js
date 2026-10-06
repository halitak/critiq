import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM_PROMPT, VISUAL_REPORT_SCHEMA, buildUserText } from '../prompt.js';

export const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5-5';
let client; // created lazily so other providers work without an API key

const image = (data) => ({
  type: 'image',
  source: { type: 'base64', media_type: 'image/jpeg', data },
});

export async function analyze(audit) {
  client ??= new Anthropic();

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: `${SYSTEM_PROMPT}\nAlways respond by calling the submit_report tool.`,
    tools: [{ name: 'submit_report', description: 'Submit the final UI audit report.', input_schema: VISUAL_REPORT_SCHEMA }],
    tool_choice: { type: 'tool', name: 'submit_report' },
    messages: [
      {
        role: 'user',
        content: [
          image(audit.screenshots.desktop),
          image(audit.screenshots.mobile),
          { type: 'text', text: buildUserText(audit) },
        ],
      },
    ],
  });

  const toolUse = response.content.find((block) => block.type === 'tool_use');
  if (!toolUse) throw new Error('Model did not return a report');
  return toolUse.input;
}
