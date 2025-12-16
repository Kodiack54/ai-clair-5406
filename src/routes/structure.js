/**
 * Structure Routes - File trees with descriptions
 *
 * Full clickable file/folder trees with annotations
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

// Folders/files to ignore
const IGNORE_PATTERNS = [
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  '.cache',
  '__pycache__',
  '.DS_Store',
  'Thumbs.db',
  '*.log'
];

// GET /api/structure/:project - Get full tree with descriptions
router.get('/:project', async (req, res) => {
  try {
    const { project } = req.params;
    const { depth = 3 } = req.query;
    const projectPath = decodeURIComponent(project);

    // Build file tree
    const tree = await buildTree(projectPath, parseInt(depth));

    // Get stored descriptions
    const { data: descriptions } = await supabase
      .from('dev_ai_folder_descriptions')
      .select('folder_path, description')
      .eq('project_path', projectPath);

    // Merge descriptions into tree
    const descMap = {};
    descriptions?.forEach(d => {
      descMap[d.folder_path] = d.description;
    });

    annotateTree(tree, descMap, '');

    res.json({
      success: true,
      project: projectPath,
      tree,
      descriptionCount: descriptions?.length || 0
    });
  } catch (error) {
    console.error('[Clair/Structure] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/structure/:project/describe - Add/update folder description
router.post('/:project/describe', async (req, res) => {
  try {
    const { project } = req.params;
    const { folder_path, description } = req.body;
    const projectPath = decodeURIComponent(project);

    if (!folder_path || !description) {
      return res.status(400).json({
        success: false,
        error: 'folder_path and description are required'
      });
    }

    const { data, error } = await supabase
      .from('dev_ai_folder_descriptions')
      .upsert({
        project_path: projectPath,
        folder_path,
        description,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'project_path,folder_path'
      })
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      description: data
    });
  } catch (error) {
    console.error('[Clair/Structure] Describe error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/structure/:project/descriptions - Get all descriptions
router.get('/:project/descriptions', async (req, res) => {
  try {
    const { project } = req.params;
    const projectPath = decodeURIComponent(project);

    const { data, error } = await supabase
      .from('dev_ai_folder_descriptions')
      .select('*')
      .eq('project_path', projectPath)
      .order('folder_path');

    if (error) throw error;

    res.json({
      success: true,
      descriptions: data || []
    });
  } catch (error) {
    console.error('[Clair/Structure] Descriptions error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/structure/:project/describe/:id - Remove description
router.delete('/:project/describe/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('dev_ai_folder_descriptions')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({
      success: true,
      deleted: id
    });
  } catch (error) {
    console.error('[Clair/Structure] Delete error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/structure/:project/export - Export as ASCII tree
router.post('/:project/export', async (req, res) => {
  try {
    const { project } = req.params;
    const { depth = 3, includeDescriptions = true } = req.body;
    const projectPath = decodeURIComponent(project);

    const tree = await buildTree(projectPath, parseInt(depth));

    // Get descriptions if requested
    let descMap = {};
    if (includeDescriptions) {
      const { data } = await supabase
        .from('dev_ai_folder_descriptions')
        .select('folder_path, description')
        .eq('project_path', projectPath);

      data?.forEach(d => {
        descMap[d.folder_path] = d.description;
      });
    }

    // Generate ASCII tree
    const projectName = path.basename(projectPath);
    const ascii = generateAsciiTree(tree, projectName, descMap);

    res.json({
      success: true,
      ascii,
      format: 'text/plain'
    });
  } catch (error) {
    console.error('[Clair/Structure] Export error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Build file tree from filesystem
 */
async function buildTree(dirPath, maxDepth, currentDepth = 0) {
  const tree = {
    name: path.basename(dirPath),
    path: dirPath,
    type: 'directory',
    children: []
  };

  if (currentDepth >= maxDepth) {
    tree.truncated = true;
    return tree;
  }

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      // Skip ignored patterns
      if (shouldIgnore(entry.name)) continue;

      const entryPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        const subtree = await buildTree(entryPath, maxDepth, currentDepth + 1);
        tree.children.push(subtree);
      } else {
        tree.children.push({
          name: entry.name,
          path: entryPath,
          type: 'file',
          extension: path.extname(entry.name)
        });
      }
    }

    // Sort: directories first, then files, alphabetically
    tree.children.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  } catch (err) {
    tree.error = err.message;
  }

  return tree;
}

/**
 * Check if file/folder should be ignored
 */
function shouldIgnore(name) {
  return IGNORE_PATTERNS.some(pattern => {
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace('*', '.*') + '$');
      return regex.test(name);
    }
    return name === pattern;
  });
}

/**
 * Annotate tree with descriptions
 */
function annotateTree(node, descMap, currentPath) {
  const nodePath = currentPath ? `${currentPath}/${node.name}` : node.name;

  if (descMap[nodePath]) {
    node.description = descMap[nodePath];
  }

  if (node.children) {
    node.children.forEach(child => {
      annotateTree(child, descMap, nodePath);
    });
  }
}

/**
 * Generate ASCII tree representation
 */
function generateAsciiTree(node, rootName, descMap, prefix = '', isLast = true) {
  let result = '';
  const connector = isLast ? '└── ' : '├── ';
  const extension = isLast ? '    ' : '│   ';

  const icon = node.type === 'directory' ? '📁 ' : '📄 ';
  const desc = descMap[node.name] ? `  "${descMap[node.name]}"` : '';

  if (prefix === '') {
    result += `${rootName}/\n`;
  } else {
    result += `${prefix}${connector}${icon}${node.name}${desc}\n`;
  }

  if (node.children) {
    node.children.forEach((child, index) => {
      const childIsLast = index === node.children.length - 1;
      const childPrefix = prefix === '' ? '' : prefix + extension;
      result += generateAsciiTree(child, rootName, descMap, childPrefix, childIsLast);
    });
  }

  return result;
}

module.exports = router;
