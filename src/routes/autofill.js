/**
 * Auto-Fill Routes - Scan project folders to detect metadata
 */

const express = require('express');
const router = express.Router();
const { scanProjectFolder } = require('../services/autoFill');

// GET /api/autofill/:project - Scan a project folder for auto-detectable info
router.get('/:project', async (req, res) => {
  try {
    const { project } = req.params;
    const projectPath = decodeURIComponent(project);
    
    console.log(`[Clair/AutoFill] Scanning: ${projectPath}`);
    
    const result = await scanProjectFolder(projectPath);
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('[Clair/AutoFill] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/autofill/:project/apply - Apply auto-detected values to project
router.post('/:project/apply', async (req, res) => {
  try {
    const { project } = req.params;
    const { project_id, fields } = req.body;
    const projectPath = decodeURIComponent(project);
    
    if (!project_id) {
      return res.status(400).json({ success: false, error: 'project_id is required' });
    }

    // Scan for auto-detectable info
    const scanResult = await scanProjectFolder(projectPath);
    
    // Filter to only requested fields (or all detected if no filter)
    const updates = {};
    const fieldsToApply = fields || Object.keys(scanResult.detected);
    
    for (const field of fieldsToApply) {
      if (scanResult.detected[field]) {
        updates[field] = scanResult.detected[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.json({
        success: true,
        message: 'No fields to update',
        detected: scanResult.detected
      });
    }

    // Update project in database
    const { from } = require('../../../shared/db');
    const { error } = await from('dev_projects')
      .update(updates)
      .eq('id', project_id);

    if (error) {
      throw new Error(`Database update failed: ${error.message}`);
    }

    res.json({
      success: true,
      applied: updates,
      detected: scanResult.detected
    });
  } catch (error) {
    console.error('[Clair/AutoFill] Apply error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
