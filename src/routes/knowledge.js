/**
 * Knowledge Routes - Query knowledge from database
 * Reads from dev_ai_knowledge table where Susan stores extracted knowledge
 */

const express = require('express');
const router = express.Router();
const { from } = require('../../../shared/db');

// Map database entry to UI format
function mapEntryForUI(item) {
  return {
    ...item,
    // Map knowledge_type to type for UI compatibility
    type: item.knowledge_type || item.category || 'work_log',
    // Use summary as content if content is null
    content: item.content || item.summary || ''
  };
}

// GET /api/journal/:project - List all knowledge for a project
router.get('/:project', async (req, res) => {
  try {
    const { project } = req.params;
    const projectPath = decodeURIComponent(project);

    console.log(`[Clair/Knowledge] Fetching knowledge for: ${projectPath}`);

    const { data, error } = await from('dev_ai_knowledge')
      .select('*')
      .eq('project_path', projectPath)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Map entries for UI
    const entries = (data || []).map(mapEntryForUI);

    // Group by type for UI columns
    const grouped = {
      work_log: [],
      idea: [],
      decision: [],
      lesson: []
    };
    
    entries.forEach(item => {
      const type = item.type || 'work_log';
      if (grouped[type]) {
        grouped[type].push(item);
      } else {
        grouped.work_log.push(item);
      }
    });

    res.json({
      success: true,
      project: projectPath,
      entries,
      grouped,
      count: entries.length,
      stats: {
        work_log: grouped.work_log.length,
        idea: grouped.idea.length,
        decision: grouped.decision.length,
        lesson: grouped.lesson.length
      }
    });
  } catch (error) {
    console.error('[Clair/Knowledge] List error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/journal/:project - Create a new knowledge entry
router.post('/:project', async (req, res) => {
  try {
    const { project } = req.params;
    const projectPath = decodeURIComponent(project);
    const { title, content, type, category, author, tags } = req.body;

    if (!title || !content) {
      return res.status(400).json({ success: false, error: 'Title and content are required' });
    }

    const knowledgeType = type || category || 'work_log';

    const { data, error } = await from('dev_ai_knowledge')
      .insert({
        project_path: projectPath,
        title,
        content,
        summary: content,
        knowledge_type: knowledgeType,
        category: category || knowledgeType,
        author,
        tags: tags || [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, entry: mapEntryForUI(data) });
  } catch (error) {
    console.error('[Clair/Knowledge] Create error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/journal/:project/:id - Update a knowledge entry
router.patch('/:project/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body };
    
    // Map type back to knowledge_type for database
    if (updates.type) {
      updates.knowledge_type = updates.type;
      delete updates.type;
    }

    const { data, error } = await from('dev_ai_knowledge')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, entry: mapEntryForUI(data) });
  } catch (error) {
    console.error('[Clair/Knowledge] Update error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/journal/:project/:id - Delete a knowledge entry
router.delete('/:project/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await from('dev_ai_knowledge')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ success: true, deleted: id });
  } catch (error) {
    console.error('[Clair/Knowledge] Delete error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/journal/search/:project - Search knowledge
router.get('/search/:project', async (req, res) => {
  try {
    const { project } = req.params;
    const { q } = req.query;
    const projectPath = decodeURIComponent(project);

    if (!q) {
      return res.status(400).json({ success: false, error: 'Search query required' });
    }

    const { data, error } = await from('dev_ai_knowledge')
      .select('*')
      .eq('project_path', projectPath)
      .or(`title.ilike.%${q}%,content.ilike.%${q}%,summary.ilike.%${q}%`)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const results = (data || []).map(mapEntryForUI);

    res.json({
      success: true,
      query: q,
      results,
      count: results.length
    });
  } catch (error) {
    console.error('[Clair/Knowledge] Search error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
