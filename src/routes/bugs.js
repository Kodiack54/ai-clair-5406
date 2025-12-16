/**
 * Bugs Routes - Bug lifecycle management
 *
 * Manages bug status: mark complete, archive, delete
 */

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

// PATCH /api/bugs/:id/complete - Mark bug as fixed/complete
router.patch('/:id/complete', async (req, res) => {
  try {
    const { id } = req.params;
    const { resolution } = req.body;

    const { data, error } = await supabase
      .from('dev_ai_bugs')
      .update({
        status: 'fixed',
        resolution: resolution || 'Marked complete by Clair',
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      bug: data,
      message: 'Bug marked as fixed'
    });
  } catch (error) {
    console.error('[Clair/Bugs] Complete error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/bugs/:id/archive - Archive a fixed bug
router.post('/:id/archive', async (req, res) => {
  try {
    const { id } = req.params;

    // First get the bug to check status
    const { data: bug, error: fetchError } = await supabase
      .from('dev_ai_bugs')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;

    if (bug.status !== 'fixed') {
      return res.status(400).json({
        success: false,
        error: 'Only fixed bugs can be archived'
      });
    }

    // Move to archive table (or mark as archived)
    const { data, error } = await supabase
      .from('dev_ai_bugs')
      .update({
        status: 'archived',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      bug: data,
      message: 'Bug archived'
    });
  } catch (error) {
    console.error('[Clair/Bugs] Archive error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/bugs/:id - Delete a bug permanently
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { force } = req.query;

    // Check bug status first
    const { data: bug, error: fetchError } = await supabase
      .from('dev_ai_bugs')
      .select('status')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;

    // Only allow deleting fixed/archived bugs unless force=true
    if (!['fixed', 'archived', 'wont_fix', 'duplicate'].includes(bug.status) && force !== 'true') {
      return res.status(400).json({
        success: false,
        error: 'Can only delete resolved bugs. Use ?force=true to override.'
      });
    }

    const { error } = await supabase
      .from('dev_ai_bugs')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({
      success: true,
      deleted: id,
      message: 'Bug permanently deleted'
    });
  } catch (error) {
    console.error('[Clair/Bugs] Delete error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/bugs/cleanup - Auto-archive old fixed bugs
router.post('/cleanup', async (req, res) => {
  try {
    const { daysOld = 30, action = 'archive' } = req.body;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    // Find old fixed bugs
    const { data: oldBugs, error: fetchError } = await supabase
      .from('dev_ai_bugs')
      .select('id, title, resolved_at')
      .eq('status', 'fixed')
      .lt('resolved_at', cutoffDate.toISOString());

    if (fetchError) throw fetchError;

    if (!oldBugs || oldBugs.length === 0) {
      return res.json({
        success: true,
        message: 'No bugs to clean up',
        processed: 0
      });
    }

    const bugIds = oldBugs.map(b => b.id);

    if (action === 'archive') {
      const { error } = await supabase
        .from('dev_ai_bugs')
        .update({
          status: 'archived',
          updated_at: new Date().toISOString()
        })
        .in('id', bugIds);

      if (error) throw error;

      res.json({
        success: true,
        action: 'archived',
        processed: bugIds.length,
        bugs: oldBugs.map(b => ({ id: b.id, title: b.title }))
      });
    } else if (action === 'delete') {
      const { error } = await supabase
        .from('dev_ai_bugs')
        .delete()
        .in('id', bugIds);

      if (error) throw error;

      res.json({
        success: true,
        action: 'deleted',
        processed: bugIds.length,
        bugs: oldBugs.map(b => ({ id: b.id, title: b.title }))
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Invalid action. Must be "archive" or "delete"'
      });
    }
  } catch (error) {
    console.error('[Clair/Bugs] Cleanup error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/bugs/stats/:project - Get bug statistics
router.get('/stats/:project', async (req, res) => {
  try {
    const { project } = req.params;
    const projectPath = decodeURIComponent(project);

    const { data, error } = await supabase
      .from('dev_ai_bugs')
      .select('status, severity')
      .eq('project_path', projectPath);

    if (error) throw error;

    const stats = {
      total: data?.length || 0,
      byStatus: {
        open: 0,
        investigating: 0,
        fixed: 0,
        archived: 0,
        wont_fix: 0,
        duplicate: 0
      },
      bySeverity: {
        low: 0,
        medium: 0,
        high: 0,
        critical: 0
      }
    };

    data?.forEach(bug => {
      if (stats.byStatus[bug.status] !== undefined) {
        stats.byStatus[bug.status]++;
      }
      if (stats.bySeverity[bug.severity] !== undefined) {
        stats.bySeverity[bug.severity]++;
      }
    });

    // Calculate active (not resolved)
    stats.active = stats.byStatus.open + stats.byStatus.investigating;
    stats.resolved = stats.byStatus.fixed + stats.byStatus.archived + stats.byStatus.wont_fix + stats.byStatus.duplicate;

    res.json({
      success: true,
      project: projectPath,
      stats
    });
  } catch (error) {
    console.error('[Clair/Bugs] Stats error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/bugs/:id/reopen - Reopen an archived/fixed bug
router.patch('/:id/reopen', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const { data, error } = await supabase
      .from('dev_ai_bugs')
      .update({
        status: 'open',
        resolution: reason ? `Reopened: ${reason}` : 'Reopened',
        resolved_at: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      bug: data,
      message: 'Bug reopened'
    });
  } catch (error) {
    console.error('[Clair/Bugs] Reopen error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
