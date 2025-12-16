/**
 * Knowledge/Journal Routes - Project work log, ideas, decisions, lessons
 *
 * Maintains a living journal for each project
 */

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

const ENTRY_TYPES = ['work_log', 'idea', 'decision', 'lesson'];

// GET /api/journal/:project - Get journal entries
router.get('/:project', async (req, res) => {
  try {
    const { project } = req.params;
    const { type, limit = 50, offset = 0 } = req.query;
    const projectPath = decodeURIComponent(project);

    let query = supabase
      .from('dev_ai_journal')
      .select('*')
      .eq('project_path', projectPath)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (type && ENTRY_TYPES.includes(type)) {
      query = query.eq('entry_type', type);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Group by entry type
    const grouped = {
      work_log: [],
      idea: [],
      decision: [],
      lesson: []
    };

    data?.forEach(entry => {
      if (grouped[entry.entry_type]) {
        grouped[entry.entry_type].push(entry);
      }
    });

    res.json({
      success: true,
      project: projectPath,
      total: data?.length || 0,
      entries: data || [],
      grouped
    });
  } catch (error) {
    console.error('[Clair/Journal] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/journal/:project - Add journal entry
router.post('/:project', async (req, res) => {
  try {
    const { project } = req.params;
    const { entry_type, title, content, created_by } = req.body;
    const projectPath = decodeURIComponent(project);

    if (!ENTRY_TYPES.includes(entry_type)) {
      return res.status(400).json({
        success: false,
        error: `Invalid entry_type. Must be one of: ${ENTRY_TYPES.join(', ')}`
      });
    }

    if (!title || !content) {
      return res.status(400).json({
        success: false,
        error: 'title and content are required'
      });
    }

    const { data, error } = await supabase
      .from('dev_ai_journal')
      .insert({
        project_path: projectPath,
        entry_type,
        title,
        content,
        created_by: created_by || 'clair'
      })
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      entry: data
    });
  } catch (error) {
    console.error('[Clair/Journal] Create error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/journal/:project/:id - Update journal entry
router.patch('/:project/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content } = req.body;

    const updates = {};
    if (title) updates.title = title;
    if (content) updates.content = content;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }

    const { data, error } = await supabase
      .from('dev_ai_journal')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      entry: data
    });
  } catch (error) {
    console.error('[Clair/Journal] Update error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/journal/:project/:id - Delete journal entry
router.delete('/:project/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('dev_ai_journal')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({
      success: true,
      deleted: id
    });
  } catch (error) {
    console.error('[Clair/Journal] Delete error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/journal/:project/stats - Get journal statistics
router.get('/:project/stats', async (req, res) => {
  try {
    const { project } = req.params;
    const projectPath = decodeURIComponent(project);

    const { data, error } = await supabase
      .from('dev_ai_journal')
      .select('entry_type')
      .eq('project_path', projectPath);

    if (error) throw error;

    const stats = {
      work_log: 0,
      idea: 0,
      decision: 0,
      lesson: 0,
      total: data?.length || 0
    };

    data?.forEach(entry => {
      if (stats[entry.entry_type] !== undefined) {
        stats[entry.entry_type]++;
      }
    });

    res.json({
      success: true,
      project: projectPath,
      stats
    });
  } catch (error) {
    console.error('[Clair/Journal] Stats error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
