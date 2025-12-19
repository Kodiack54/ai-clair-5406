/**
 * Clair - AI Documentation Manager
 * Port 5406
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');

const PORT = process.env.PORT || 5406;

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use((req, res, next) => {
  console.log(`[Clair] ${req.method} ${req.path}`);
  next();
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'clair-5406', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/todos', require('./src/routes/todos'));
app.use('/api/journal', require('./src/routes/knowledge'));
app.use('/api/docs', require('./src/routes/docs'));
app.use('/api/database', require('./src/routes/database'));
app.use('/api/structure', require('./src/routes/structure'));
app.use('/api/conventions', require('./src/routes/conventions'));
app.use('/api/bugs', require('./src/routes/bugs'));
app.use('/api/corrections', require('./src/routes/corrections'));
app.use('/api/cleanup', require('./src/routes/cleanup'));
app.use('/api/scheduler', require('./src/routes/scheduler'));
app.use('/api/autofill', require('./src/routes/autofill'));
app.use('/api/projects', require('./src/routes/projects'));

app.use((err, req, res, next) => {
  console.error('[Clair] Error:', err.message);
  res.status(500).json({ error: err.message });
});

const { initScheduler } = require('./src/services/dailySummary');
const { initDayScheduler } = require('./src/services/dayOrganizer');
const { initNightScheduler } = require('./src/services/nightCompiler');

const server = app.listen(PORT, () => {
  initScheduler();
  initDayScheduler();
  initNightScheduler();
  const susanAssist = require('./src/services/susanAssist');
  susanAssist.start();
  console.log(`[Clair] Running on port ${PORT} - Daily consolidation at 2am PST`);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
process.on('uncaughtException', (err) => { console.error('[Clair] Error:', err.message); process.exit(1); });
