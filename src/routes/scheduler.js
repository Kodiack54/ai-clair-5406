/**
 * Scheduler Routes - Manual trigger for scheduled jobs
 */

const express = require('express');
const router = express.Router();
const { runDailySummary } = require('../services/dailySummary');

// POST /api/scheduler/daily-summary - Manually trigger daily summary
router.post('/daily-summary', async (req, res) => {
  console.log('[Clair/Scheduler] Manual daily summary triggered');
  
  try {
    const result = await runDailySummary();
    res.json(result);
  } catch (error) {
    console.error('[Clair/Scheduler] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/scheduler/status - Check scheduler status
router.get('/status', (req, res) => {
  res.json({
    success: true,
    scheduler: 'active',
    jobs: [
      {
        name: 'daily-summary',
        schedule: '0 2 * * *',
        description: 'Summarize Chad sessions into journal entries',
        timezone: 'America/Los_Angeles'
      }
    ]
  });
});

module.exports = router;
