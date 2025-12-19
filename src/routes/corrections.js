/**
 * Corrections Routes - User feedback on AI-generated content
 *
 * Allows users to flag, correct, move, or request rewording of
 * knowledge entries, journal entries, docs, and conventions
 */

const express = require('express');
const router = express.Router();
const supabase = require('../../../shared/db');


const ITEM_TYPES = ['knowledge', 'journal', 'doc', 'convention'];
const CORRECTION_TYPES = ['move', 'remove', 'reword', 'note', 'merge'];
const STATUSES = ['pending', 'applied', 'rejected', 'reviewed'];

// GET /api/corrections - Get all corrections (with filters)
router.get('/', async (req, res) => {
  try {
    const { status, item_type, limit = 50 } = req.query;

    let query = supabase
      .from('dev_ai_corrections')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (status && STATUSES.includes(status)) {
      query = query.eq('status', status);
    }

    if (item_type && ITEM_TYPES.includes(item_type)) {
      query = query.eq('item_type', item_type);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json({
      success: true,
      total: data?.length || 0,
      corrections: data || []
    });
  } catch (error) {
    console.error('[Clair/Corrections] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/corrections/pending - Get pending corrections count
router.get('/pending', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('dev_ai_corrections')
      .select('id', { count: 'exact' })
      .eq('status', 'pending');

    if (error) throw error;

    res.json({
      success: true,
      pendingCount: data?.length || 0
    });
  } catch (error) {
    console.error('[Clair/Corrections] Pending count error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/corrections - Create a new correction
router.post('/', async (req, res) => {
  try {
    const { item_type, item_id, correction_type, details, created_by } = req.body;

    // Validate
    if (!ITEM_TYPES.includes(item_type)) {
      return res.status(400).json({
        success: false,
        error: `Invalid item_type. Must be one of: ${ITEM_TYPES.join(', ')}`
      });
    }

    if (!CORRECTION_TYPES.includes(correction_type)) {
      return res.status(400).json({
        success: false,
        error: `Invalid correction_type. Must be one of: ${CORRECTION_TYPES.join(', ')}`
      });
    }

    if (!item_id) {
      return res.status(400).json({
        success: false,
        error: 'item_id is required'
      });
    }

    const { data, error } = await supabase
      .from('dev_ai_corrections')
      .insert({
        item_type,
        item_id,
        correction_type,
        details: details || {},
        created_by: created_by || 'user',
        status: 'pending'
      })
      .select()
      .single();

    if (error) throw error;

    console.log(`[Clair/Corrections] New ${correction_type} correction for ${item_type}:${item_id}`);

    res.json({
      success: true,
      correction: data
    });
  } catch (error) {
    console.error('[Clair/Corrections] Create error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/corrections/:id - Update correction status
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, applied_by } = req.body;

    if (status && !STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${STATUSES.join(', ')}`
      });
    }

    const updates = {};
    if (status) {
      updates.status = status;
      if (status === 'applied') {
        updates.applied_at = new Date().toISOString();
        updates.applied_by = applied_by || 'clair';
      }
    }

    const { data, error } = await supabase
      .from('dev_ai_corrections')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      correction: data
    });
  } catch (error) {
    console.error('[Clair/Corrections] Update error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/corrections/:id - Delete a correction
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('dev_ai_corrections')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({
      success: true,
      deleted: id
    });
  } catch (error) {
    console.error('[Clair/Corrections] Delete error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/corrections/:id/apply - Apply a correction (Clair processes it)
router.post('/:id/apply', async (req, res) => {
  try {
    const { id } = req.params;

    // Get the correction
    const { data: correction, error: fetchError } = await supabase
      .from('dev_ai_corrections')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;

    if (!correction) {
      return res.status(404).json({ success: false, error: 'Correction not found' });
    }

    // Apply based on correction type
    let result = { applied: false, message: '' };

    switch (correction.correction_type) {
      case 'remove':
        result = await applyRemove(correction);
        break;
      case 'move':
        result = await applyMove(correction);
        break;
      case 'reword':
        // Reword requires Claude - mark as reviewed for manual processing
        result = { applied: false, message: 'Reword corrections require manual review' };
        break;
      case 'note':
        // Notes are informational - just mark as reviewed
        result = { applied: true, message: 'Note acknowledged' };
        break;
      case 'merge':
        result = { applied: false, message: 'Merge corrections require manual review' };
        break;
    }

    // Update correction status
    const newStatus = result.applied ? 'applied' : 'reviewed';
    await supabase
      .from('dev_ai_corrections')
      .update({
        status: newStatus,
        applied_at: result.applied ? new Date().toISOString() : null,
        applied_by: 'clair'
      })
      .eq('id', id);

    res.json({
      success: true,
      result,
      newStatus
    });
  } catch (error) {
    console.error('[Clair/Corrections] Apply error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Helper: Apply remove correction
async function applyRemove(correction) {
  const tableMap = {
    knowledge: 'dev_ai_knowledge',
    journal: 'dev_ai_journal',
    doc: 'dev_ai_generated_docs',
    convention: 'dev_ai_conventions'
  };

  const table = tableMap[correction.item_type];
  if (!table) return { applied: false, message: 'Unknown item type' };

  const { error } = await supabase
    .from(table)
    .delete()
    .eq('id', correction.item_id);

  if (error) return { applied: false, message: error.message };
  return { applied: true, message: `Removed ${correction.item_type} item` };
}

// Helper: Apply move correction (change project_path)
async function applyMove(correction) {
  const tableMap = {
    knowledge: 'dev_ai_knowledge',
    journal: 'dev_ai_journal',
    doc: 'dev_ai_generated_docs',
    convention: 'dev_ai_conventions'
  };

  const table = tableMap[correction.item_type];
  if (!table) return { applied: false, message: 'Unknown item type' };

  const targetProject = correction.details?.target_project;
  if (!targetProject) return { applied: false, message: 'No target_project specified' };

  const { error } = await supabase
    .from(table)
    .update({ project_path: targetProject })
    .eq('id', correction.item_id);

  if (error) return { applied: false, message: error.message };
  return { applied: true, message: `Moved to ${targetProject}` };
}

module.exports = router;
