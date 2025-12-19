/**
 * Project Routes - Setup and sync projects
 */

const express = require('express');
const router = express.Router();
const { setupNewProject, setupMissingProjects, addProjectPath } = require('../services/projectSetup');
const { syncProject, syncAllProjects } = require('../services/projectSync');

// POST /api/projects/setup/:projectId - Set up a new project
router.post('/setup/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const result = await setupNewProject(projectId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/projects/setup-missing - Set up all projects missing paths
router.post('/setup-missing', async (req, res) => {
  try {
    const result = await setupMissingProjects();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/projects/:projectId/add-path - Add a path to a project
router.post('/:projectId/add-path', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { path, label } = req.body;
    if (!path) return res.status(400).json({ success: false, error: 'path required' });
    const result = await addProjectPath(projectId, path, label);
    res.json({ success: !!result, path: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/projects/:projectId/sync - Sync project info from folder
router.post('/:projectId/sync', async (req, res) => {
  try {
    const { projectId } = req.params;
    console.log(`[Clair/Projects] Syncing project: ${projectId}`);
    const result = await syncProject(projectId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/projects/sync-all - Sync ALL projects from folders
router.post('/sync-all', async (req, res) => {
  try {
    console.log('[Clair/Projects] Syncing all projects...');
    const result = await syncAllProjects();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
