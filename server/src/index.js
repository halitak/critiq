import 'dotenv/config';
import express from 'express';
import { runAudit } from './audit.js';
import { analyzeAudit } from './ai/index.js';

const app = express();
app.use(express.json());

app.post('/audit', async (req, res) => {
  const { url } = req.body ?? {};

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return res.status(400).json({ error: 'Only http and https URLs are supported' });
  }

  try {
    const started = Date.now();
    const audit = await runAudit(parsed.href);
    const report = await analyzeAudit(audit);
    console.log(`Audited ${parsed.href} in ${Date.now() - started}ms`);

    res.json({ ...audit, report });
  } catch (err) {
    console.error('Audit failed:', err);
    res.status(500).json({ error: 'Audit failed', detail: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, (err) => {
  // Express 5 passes listen errors (e.g. EADDRINUSE) here instead of throwing
  if (err) {
    console.error(`Could not start server on port ${PORT}:`, err.message);
    process.exit(1);
  }
  console.log(`Critiq server running on http://localhost:${PORT}`);
});
