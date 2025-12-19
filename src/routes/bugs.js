/**
 * Bugs Routes - Bug lifecycle management
 * Now includes GET endpoint to list bugs from database
 */

const express = require('express');
const router = express.Router();
const { from } = require('../../../shared/db');

// GET /api/bugs/:project - List all bugs for a project
router.get('/:project', async (req, res) => {
  try {
    const { project } = req.params;
    const projectPath = decodeURIComponent(project);

    console.log(`[Clair/Bugs] Fetching bugs for: ${projectPath}`);

    const { data, error } = await from('dev_ai_bugs')
      .select('*')
      .eq('project_path', projectPath)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      project: projectPath,
      bugs: data || [],
      count: data?.length || 0
    });
  } catch (error) {
    console.error('[Clair/Bugs] List error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/bugs/:project - Create a new bug
router.post('/:project', async (req, res) => {
  try {
    const { project } = req.params;
    const projectPath = decodeURIComponent(project);
    const { title, description, severity, category, file_path, line_number } = req.body;

    if (!title) {
      return res.status(400).json({ success: false, error: 'Title is required' });
    }

    const { data, error } = await from('dev_ai_bugs')
      .insert({
        project_path: projectPath,
        title,
        description,
        severity: severity || 'medium',
        category,
        file_path,
        line_number,
        status: 'open',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, bug: data });
  } catch (error) {
    console.error('[Clair/Bugs] Create error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/bugs/:project/:id - Update a bug
router.patch('/:project/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const { data, error } = await from('dev_ai_bugs')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, bug: data });
  } catch (error) {
    console.error('[Clair/Bugs] Update error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/bugs/:project/:id/complete - Mark bug as fixed
router.patch('/:project/:id/complete', async (req, res) => {
  try {
    const { id } = req.params;
    const { resolution } = req.body;

    const { data, error } = await from('dev_ai_bugs')
      .update({
        status: 'fixed',
        resolution: resolution || 'Marked complete',
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, bug: data, message: 'Bug marked as fixed' });
  } catch (error) {
    console.error('[Clair/Bugs] Complete error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/bugs/:project/:id/archive - Archive a bug
router.post('/:project/:id/archive', async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await from('dev_ai_bugs')
      .update({
        status: 'archived',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, bug: data, message: 'Bug archived' });
  } catch (error) {
    console.error('[Clair/Bugs] Archive error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/bugs/:project/:id - Delete a bug
router.delete('/:project/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await from('dev_ai_bugs')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ success: true, deleted: id });
  } catch (error) {
    console.error('[Clair/Bugs] Delete error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/bugs/stats/:project - Get bug statistics
router.get('/stats/:project', async (req, res) => {
  try {
    const { project } = req.params;
    const projectPath = decodeURIComponent(project);

    const { data, error } = await from('dev_ai_bugs')
      .select('status, severity')
      .eq('project_path', projectPath);

    if (error) throw error;

    const stats = {
      total: data?.length || 0,
      byStatus: { open: 0, investigating: 0, fixed: 0, archived: 0 },
      bySeverity: { low: 0, medium: 0, high: 0, critical: 0 }
    };

    data?.forEach(bug => {
      if (stats.byStatus[bug.status] !== undefined) stats.byStatus[bug.status]++;
      if (stats.bySeverity[bug.severity] !== undefined) stats.bySeverity[bug.severity]++;
    });

    stats.active = stats.byStatus.open + stats.byStatus.investigating;
    stats.resolved = stats.total - stats.active;

    res.json({ success: true, project: projectPath, stats });
  } catch (error) {
    console.error('[Clair/Bugs] Stats error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
