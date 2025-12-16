/**
 * Clair - AI Documentation Manager
 * Port 5406
 *
 * Maintains and organizes project documentation across all tabs:
 * - Todos: Scans TODO.md files by folder
 * - Knowledge: Project journal (work log, ideas, decisions)
 * - Docs: Technical documentation, how-to guides
 * - Database: Schema documentation
 * - Structure: File trees with descriptions
 * - Conventions: Coding patterns for Claude
 * - Bugs: Lifecycle management
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');

const PORT = process.env.PORT || 5406;
const SUSAN_URL = process.env.SUSAN_URL || 'http://localhost:5403';

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  console.log(`[Clair] ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'clair-5406',
    role: 'Documentation Manager',
    timestamp: new Date().toISOString()
  });
});

// Routes
const todosRouter = require('./src/routes/todos');
const knowledgeRouter = require('./src/routes/knowledge');
const docsRouter = require('./src/routes/docs');
const databaseRouter = require('./src/routes/database');
const structureRouter = require('./src/routes/structure');
const conventionsRouter = require('./src/routes/conventions');
const bugsRouter = require('./src/routes/bugs');

app.use('/api/todos', todosRouter);
app.use('/api/journal', knowledgeRouter);
app.use('/api/docs', docsRouter);
app.use('/api/database', databaseRouter);
app.use('/api/structure', structureRouter);
app.use('/api/conventions', conventionsRouter);
app.use('/api/bugs', bugsRouter);

// Error handler
app.use((err, req, res, next) => {
  console.error('[Clair] Error:', err.message);
  res.status(500).json({ error: err.message });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`
====================================
  Clair - Documentation Manager
  Port: ${PORT}
====================================

  HTTP API:  http://localhost:${PORT}
  Susan:     ${SUSAN_URL}

  Endpoints:
    GET  /health                      Health check

    Todos (TODO.md scanning):
    GET  /api/todos/:project          Get TODO.md files by folder
    POST /api/todos/:project/scan     Rescan project folders

    Knowledge/Journal:
    GET  /api/journal/:project        Get journal entries
    POST /api/journal/:project        Add journal entry

    Docs (Technical Documentation):
    GET  /api/docs/:project           List all docs
    POST /api/docs/:project/generate  Generate doc by type
    GET  /api/docs/:project/howto     Get how-to guides

    Database Documentation:
    GET  /api/database/:project/tables   Get table list
    GET  /api/database/:project/schemas  Get schema info
    GET  /api/database/:project/rls      Get RLS policies

    Structure (File Trees):
    GET  /api/structure/:project         Get tree with descriptions
    POST /api/structure/:project/describe Add folder description

    Conventions (Coding Patterns):
    GET  /api/conventions/:project    Get coding conventions
    POST /api/conventions/:project    Add/update convention

    Bugs (Lifecycle):
    PATCH /api/bugs/:id/complete      Mark bug fixed
    POST  /api/bugs/:id/archive       Archive bug
    DELETE /api/bugs/:id              Delete bug

  Ready to manage documentation.
====================================
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Clair] SIGTERM received, shutting down...');
  server.close(() => {
    console.log('[Clair] Shutdown complete');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('[Clair] SIGINT received, shutting down...');
  server.close(() => {
    console.log('[Clair] Shutdown complete');
    process.exit(0);
  });
});

// Handle uncaught errors
process.on('uncaughtException', (err) => {
  console.error('[Clair] Uncaught exception:', err.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Clair] Unhandled rejection:', reason);
});
