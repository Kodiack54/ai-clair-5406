/**
 * Conventions Routes - Coding patterns documentation for Claude
 *
 * Documents naming conventions, patterns, tech stack, quirks
 */

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

const CATEGORIES = ['naming', 'structure', 'database', 'api', 'quirk', 'stack', 'pattern'];

// GET /api/conventions/:project - Get all coding conventions
router.get('/:project', async (req, res) => {
  try {
    const { project } = req.params;
    const { category } = req.query;
    const projectPath = decodeURIComponent(project);

    let query = supabase
      .from('dev_ai_conventions')
      .select('*')
      .eq('project_path', projectPath)
      .order('category, pattern');

    if (category && CATEGORIES.includes(category)) {
      query = query.eq('category', category);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Group by category
    const grouped = {};
    CATEGORIES.forEach(c => grouped[c] = []);

    data?.forEach(conv => {
      if (grouped[conv.category]) {
        grouped[conv.category].push(conv);
      }
    });

    // Generate markdown summary for Claude
    const markdown = generateConventionMarkdown(projectPath, grouped);

    res.json({
      success: true,
      project: projectPath,
      total: data?.length || 0,
      conventions: data || [],
      grouped,
      markdown
    });
  } catch (error) {
    console.error('[Clair/Conventions] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/conventions/:project - Add/update convention
router.post('/:project', async (req, res) => {
  try {
    const { project } = req.params;
    const { category, pattern, example, notes } = req.body;
    const projectPath = decodeURIComponent(project);

    if (!CATEGORIES.includes(category)) {
      return res.status(400).json({
        success: false,
        error: `Invalid category. Must be one of: ${CATEGORIES.join(', ')}`
      });
    }

    if (!pattern) {
      return res.status(400).json({
        success: false,
        error: 'pattern is required'
      });
    }

    const { data, error } = await supabase
      .from('dev_ai_conventions')
      .insert({
        project_path: projectPath,
        category,
        pattern,
        example,
        notes
      })
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      convention: data
    });
  } catch (error) {
    console.error('[Clair/Conventions] Create error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/conventions/:project/:id - Update convention
router.patch('/:project/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { pattern, example, notes } = req.body;

    const updates = {};
    if (pattern !== undefined) updates.pattern = pattern;
    if (example !== undefined) updates.example = example;
    if (notes !== undefined) updates.notes = notes;

    const { data, error } = await supabase
      .from('dev_ai_conventions')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      convention: data
    });
  } catch (error) {
    console.error('[Clair/Conventions] Update error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/conventions/:project/:id - Delete convention
router.delete('/:project/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('dev_ai_conventions')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({
      success: true,
      deleted: id
    });
  } catch (error) {
    console.error('[Clair/Conventions] Delete error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/conventions/:project/bulk - Bulk import conventions
router.post('/:project/bulk', async (req, res) => {
  try {
    const { project } = req.params;
    const { conventions } = req.body;
    const projectPath = decodeURIComponent(project);

    if (!Array.isArray(conventions)) {
      return res.status(400).json({
        success: false,
        error: 'conventions must be an array'
      });
    }

    const toInsert = conventions.map(c => ({
      project_path: projectPath,
      category: c.category,
      pattern: c.pattern,
      example: c.example,
      notes: c.notes
    }));

    const { data, error } = await supabase
      .from('dev_ai_conventions')
      .insert(toInsert)
      .select();

    if (error) throw error;

    res.json({
      success: true,
      imported: data?.length || 0,
      conventions: data
    });
  } catch (error) {
    console.error('[Clair/Conventions] Bulk error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Generate markdown summary for Claude quick reference
 */
function generateConventionMarkdown(projectPath, grouped) {
  const projectName = projectPath.split('/').pop() || projectPath;

  let md = `# Coding Conventions: ${projectName}\n\n`;

  if (grouped.naming?.length > 0) {
    md += `## Naming Conventions\n`;
    grouped.naming.forEach(c => {
      md += `- **${c.pattern}**`;
      if (c.example) md += ` (e.g., \`${c.example}\`)`;
      if (c.notes) md += `\n  - ${c.notes}`;
      md += '\n';
    });
    md += '\n';
  }

  if (grouped.structure?.length > 0) {
    md += `## File Structure\n`;
    grouped.structure.forEach(c => {
      md += `- **${c.pattern}**`;
      if (c.example) md += `: \`${c.example}\``;
      if (c.notes) md += `\n  - ${c.notes}`;
      md += '\n';
    });
    md += '\n';
  }

  if (grouped.database?.length > 0) {
    md += `## Database Patterns\n`;
    grouped.database.forEach(c => {
      md += `- **${c.pattern}**`;
      if (c.example) md += `: \`${c.example}\``;
      if (c.notes) md += `\n  - ${c.notes}`;
      md += '\n';
    });
    md += '\n';
  }

  if (grouped.api?.length > 0) {
    md += `## API Patterns\n`;
    grouped.api.forEach(c => {
      md += `- **${c.pattern}**`;
      if (c.example) md += `: \`${c.example}\``;
      if (c.notes) md += `\n  - ${c.notes}`;
      md += '\n';
    });
    md += '\n';
  }

  if (grouped.stack?.length > 0) {
    md += `## Tech Stack\n`;
    grouped.stack.forEach(c => {
      md += `- **${c.pattern}**`;
      if (c.notes) md += `: ${c.notes}`;
      md += '\n';
    });
    md += '\n';
  }

  if (grouped.quirk?.length > 0) {
    md += `## Quirks & Gotchas\n`;
    grouped.quirk.forEach(c => {
      md += `- **${c.pattern}**`;
      if (c.notes) md += `\n  - ${c.notes}`;
      md += '\n';
    });
    md += '\n';
  }

  if (grouped.pattern?.length > 0) {
    md += `## Common Patterns\n`;
    grouped.pattern.forEach(c => {
      md += `- **${c.pattern}**`;
      if (c.example) md += `\n  \`\`\`\n  ${c.example}\n  \`\`\``;
      if (c.notes) md += `\n  - ${c.notes}`;
      md += '\n';
    });
  }

  return md;
}

module.exports = router;
