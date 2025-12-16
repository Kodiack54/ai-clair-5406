/**
 * Todos Routes - Scans TODO.md files by project folder
 *
 * Provides folder-based TODO.md viewing like the Structure tab
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const { glob } = require('glob');

// GET /api/todos/:project - Get TODO.md files organized by folder
router.get('/:project', async (req, res) => {
  try {
    const { project } = req.params;
    const projectPath = decodeURIComponent(project);

    // Find all TODO.md files in the project
    const pattern = path.join(projectPath, '**/TODO.md').replace(/\\/g, '/');
    const todoFiles = await glob(pattern, { nodir: true });

    const todos = await Promise.all(todoFiles.map(async (filePath) => {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const relativePath = path.relative(projectPath, filePath);
        const folder = path.dirname(relativePath);

        // Parse TODO items from markdown
        const items = parseTodoItems(content);

        return {
          folder: folder === '.' ? '(root)' : folder,
          filePath,
          content,
          items,
          itemCount: items.length,
          lastModified: (await fs.stat(filePath)).mtime
        };
      } catch (err) {
        return {
          folder: path.dirname(path.relative(projectPath, filePath)),
          filePath,
          error: err.message
        };
      }
    }));

    // Group by folder
    const byFolder = todos.reduce((acc, todo) => {
      if (!acc[todo.folder]) {
        acc[todo.folder] = [];
      }
      acc[todo.folder].push(todo);
      return acc;
    }, {});

    res.json({
      success: true,
      project: projectPath,
      folderCount: Object.keys(byFolder).length,
      totalFiles: todos.length,
      folders: byFolder,
      scannedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Clair/Todos] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/todos/:project/scan - Rescan project for TODO.md files
router.post('/:project/scan', async (req, res) => {
  try {
    const { project } = req.params;
    const projectPath = decodeURIComponent(project);

    // Same as GET but force refresh
    const pattern = path.join(projectPath, '**/TODO.md').replace(/\\/g, '/');
    const todoFiles = await glob(pattern, { nodir: true });

    res.json({
      success: true,
      project: projectPath,
      filesFound: todoFiles.length,
      files: todoFiles.map(f => path.relative(projectPath, f)),
      scannedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Clair/Todos] Scan error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/todos/:project/create - Create TODO.md in a folder
router.post('/:project/create', async (req, res) => {
  try {
    const { project } = req.params;
    const { folder } = req.body;
    const projectPath = decodeURIComponent(project);

    const todoPath = path.join(projectPath, folder, 'TODO.md');

    // Check if already exists
    try {
      await fs.access(todoPath);
      return res.status(400).json({ success: false, error: 'TODO.md already exists' });
    } catch {
      // File doesn't exist, create it
    }

    const template = `# TODO

## Pending
- [ ]

## In Progress

## Completed
`;

    await fs.writeFile(todoPath, template, 'utf-8');

    res.json({
      success: true,
      created: todoPath,
      folder
    });
  } catch (error) {
    console.error('[Clair/Todos] Create error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Parse TODO items from markdown content
 */
function parseTodoItems(content) {
  const items = [];
  const lines = content.split('\n');

  let currentSection = 'Uncategorized';

  for (const line of lines) {
    // Check for section headers
    const headerMatch = line.match(/^#{1,3}\s+(.+)/);
    if (headerMatch) {
      currentSection = headerMatch[1].trim();
      continue;
    }

    // Check for checkbox items
    const todoMatch = line.match(/^[\s-]*\[([ xX])\]\s*(.+)/);
    if (todoMatch) {
      items.push({
        completed: todoMatch[1].toLowerCase() === 'x',
        text: todoMatch[2].trim(),
        section: currentSection
      });
    }

    // Check for bullet items without checkbox
    const bulletMatch = line.match(/^[\s]*[-*]\s+(?!\[)(.+)/);
    if (bulletMatch && !line.includes('[')) {
      items.push({
        completed: false,
        text: bulletMatch[1].trim(),
        section: currentSection,
        isNote: true
      });
    }
  }

  return items;
}

module.exports = router;
