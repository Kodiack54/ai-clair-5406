/**
 * Docs Routes - Technical documentation, how-to guides, schematics
 *
 * Generates and manages PDF-ready documentation
 */

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

const DOC_TYPES = ['howto', 'schematic', 'breakdown', 'reference', 'guide'];

// GET /api/docs/:project - List all docs
router.get('/:project', async (req, res) => {
  try {
    const { project } = req.params;
    const { type } = req.query;
    const projectPath = decodeURIComponent(project);

    let query = supabase
      .from('dev_ai_generated_docs')
      .select('id, project_path, doc_type, title, generated_at, is_published')
      .eq('project_path', projectPath)
      .order('generated_at', { ascending: false });

    if (type && DOC_TYPES.includes(type)) {
      query = query.eq('doc_type', type);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Group by doc type
    const grouped = {};
    DOC_TYPES.forEach(t => grouped[t] = []);

    data?.forEach(doc => {
      if (grouped[doc.doc_type]) {
        grouped[doc.doc_type].push(doc);
      }
    });

    res.json({
      success: true,
      project: projectPath,
      total: data?.length || 0,
      docs: data || [],
      grouped
    });
  } catch (error) {
    console.error('[Clair/Docs] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/docs/:project/:id - Get specific doc with content
router.get('/:project/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('dev_ai_generated_docs')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    res.json({
      success: true,
      doc: data
    });
  } catch (error) {
    console.error('[Clair/Docs] Get error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/docs/:project/generate - Generate doc by type
router.post('/:project/generate', async (req, res) => {
  try {
    const { project } = req.params;
    const { doc_type, title, source_data } = req.body;
    const projectPath = decodeURIComponent(project);

    if (!DOC_TYPES.includes(doc_type)) {
      return res.status(400).json({
        success: false,
        error: `Invalid doc_type. Must be one of: ${DOC_TYPES.join(', ')}`
      });
    }

    // TODO: Use Claude to generate content from source_data
    // For now, create a placeholder
    const content = await generateDocContent(doc_type, title, source_data, projectPath);

    const { data, error } = await supabase
      .from('dev_ai_generated_docs')
      .insert({
        project_path: projectPath,
        doc_type,
        title: title || `${doc_type} - ${new Date().toISOString()}`,
        content,
        generated_at: new Date().toISOString(),
        source_ids: source_data?.sourceIds || [],
        is_published: false
      })
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      doc: data
    });
  } catch (error) {
    console.error('[Clair/Docs] Generate error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/docs/:project/howto - Get how-to guides specifically
router.get('/:project/howto', async (req, res) => {
  try {
    const { project } = req.params;
    const projectPath = decodeURIComponent(project);

    const { data, error } = await supabase
      .from('dev_ai_generated_docs')
      .select('*')
      .eq('project_path', projectPath)
      .in('doc_type', ['howto', 'guide'])
      .eq('is_published', true)
      .order('title');

    if (error) throw error;

    res.json({
      success: true,
      project: projectPath,
      guides: data || []
    });
  } catch (error) {
    console.error('[Clair/Docs] Howto error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/docs/:project/:id - Update doc
router.patch('/:project/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, is_published } = req.body;

    const updates = {};
    if (title !== undefined) updates.title = title;
    if (content !== undefined) updates.content = content;
    if (is_published !== undefined) updates.is_published = is_published;

    const { data, error } = await supabase
      .from('dev_ai_generated_docs')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      doc: data
    });
  } catch (error) {
    console.error('[Clair/Docs] Update error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/docs/:project/:id - Delete doc
router.delete('/:project/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('dev_ai_generated_docs')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({
      success: true,
      deleted: id
    });
  } catch (error) {
    console.error('[Clair/Docs] Delete error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Generate document content (placeholder - will use Claude)
 */
async function generateDocContent(docType, title, sourceData, projectPath) {
  // TODO: Integrate with Claude API for actual content generation

  const templates = {
    howto: `# ${title || 'How-To Guide'}

## Overview
[Description of what this guide covers]

## Prerequisites
- [ ] Prerequisite 1
- [ ] Prerequisite 2

## Steps

### Step 1: [Action]
[Instructions]

### Step 2: [Action]
[Instructions]

## Troubleshooting
[Common issues and solutions]

## Related Guides
- [Link to related guide]
`,
    schematic: `# ${title || 'System Schematic'}

## Overview
[System description]

## Components
| Component | Purpose | Location |
|-----------|---------|----------|
| | | |

## Data Flow
\`\`\`
[Diagram placeholder]
\`\`\`

## Connections
[How components interact]
`,
    breakdown: `# ${title || 'System Breakdown'}

## Purpose
[What this system does]

## Components

### Component 1
- **Purpose**:
- **Location**:
- **Dependencies**:

### Component 2
- **Purpose**:
- **Location**:
- **Dependencies**:

## How It Works
[Step-by-step explanation]
`,
    reference: `# ${title || 'Reference Document'}

## Overview
[Description]

## Details
[Content]

## See Also
- [Related items]
`,
    guide: `# ${title || 'Guide'}

## Introduction
[Overview]

## Content
[Main content]

## Summary
[Key takeaways]
`
  };

  return templates[docType] || templates.reference;
}

module.exports = router;
