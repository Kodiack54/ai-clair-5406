/**
 * Todos Routes - Query todos from database
 * Reads from dev_ai_todos table where Susan stores extracted todos
 */

const express = require('express');
const router = express.Router();
const { from } = require('../../../shared/db');

// GET /api/todos/:project - List all todos for a project
router.get('/:project', async (req, res) => {
  try {
    const { project } = req.params;
    const projectPath = decodeURIComponent(project);

    console.log(`[Clair/Todos] Fetching todos for: ${projectPath}`);

    const { data, error } = await from('dev_ai_todos')
      .select('*')
      .eq('project_path', projectPath)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Group by status for UI
    const grouped = {
      pending: [],
      in_progress: [],
      completed: []
    };

    (data || []).forEach(todo => {
      const status = todo.status || 'pending';
      if (grouped[status]) {
        grouped[status].push(todo);
      } else {
        grouped.pending.push(todo);
      }
    });

    res.json({
      success: true,
      project: projectPath,
      todos: data || [],
      grouped,
      count: data?.length || 0,
      stats: {
        pending: grouped.pending.length,
        in_progress: grouped.in_progress.length,
        completed: grouped.completed.length
      }
    });
  } catch (error) {
    console.error('[Clair/Todos] List error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/todos/:project - Create a new todo
router.post('/:project', async (req, res) => {
  try {
    const { project } = req.params;
    const projectPath = decodeURIComponent(project);
    const { title, description, priority, category, tags } = req.body;

    if (!title) {
      return res.status(400).json({ success: false, error: 'Title is required' });
    }

    const { data, error } = await from('dev_ai_todos')
      .insert({
        project_path: projectPath,
        title,
        description,
        priority: priority || 'medium',
        category,
        tags: tags || [],
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, todo: data });
  } catch (error) {
    console.error('[Clair/Todos] Create error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/todos/:project/:id - Update a todo
router.patch('/:project/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Handle status change to completed
    if (updates.status === 'completed' && !updates.completed_at) {
      updates.completed_at = new Date().toISOString();
    }

    const { data, error } = await from('dev_ai_todos')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, todo: data });
  } catch (error) {
    console.error('[Clair/Todos] Update error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/todos/:project/:id/complete - Mark todo as complete
router.patch('/:project/:id/complete', async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await from('dev_ai_todos')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, todo: data, message: 'Todo completed' });
  } catch (error) {
    console.error('[Clair/Todos] Complete error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/todos/:project/:id - Delete a todo
router.delete('/:project/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await from('dev_ai_todos')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ success: true, deleted: id });
  } catch (error) {
    console.error('[Clair/Todos] Delete error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/todos/stats/:project - Get todo statistics  
router.get('/stats/:project', async (req, res) => {
  try {
    const { project } = req.params;
    const projectPath = decodeURIComponent(project);

    const { data, error } = await from('dev_ai_todos')
      .select('status, priority')
      .eq('project_path', projectPath);

    if (error) throw error;

    const stats = {
      total: data?.length || 0,
      byStatus: { pending: 0, in_progress: 0, completed: 0 },
      byPriority: { low: 0, medium: 0, high: 0, critical: 0 }
    };

    data?.forEach(todo => {
      if (stats.byStatus[todo.status] !== undefined) stats.byStatus[todo.status]++;
      if (stats.byPriority[todo.priority] !== undefined) stats.byPriority[todo.priority]++;
    });

    res.json({ success: true, project: projectPath, stats });
  } catch (error) {
    console.error('[Clair/Todos] Stats error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
