/**
 * Susan Client - Fetches data from Susan's API
 *
 * Used to query Susan's knowledge base for generating docs
 */

const SUSAN_URL = process.env.SUSAN_URL || 'http://localhost:5403';

/**
 * Fetch from Susan's API
 */
async function susanFetch(endpoint, options = {}) {
  const url = `${SUSAN_URL}${endpoint}`;
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`Susan returned ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`[Clair/SusanClient] API error: ${error.message}`);
    throw error;
  }
}

/**
 * Get project knowledge from Susan
 */
async function getKnowledge(projectPath, options = {}) {
  const { category, limit = 50 } = options;
  let endpoint = `/api/query?project=${encodeURIComponent(projectPath)}&limit=${limit}`;
  if (category) {
    endpoint += `&category=${encodeURIComponent(category)}`;
  }
  return susanFetch(endpoint);
}

/**
 * Get project todos from Susan
 */
async function getTodos(projectPath, status = 'all') {
  return susanFetch(`/api/todos?project=${encodeURIComponent(projectPath)}&status=${status}`);
}

/**
 * Get project bugs from Susan
 */
async function getBugs(projectPath) {
  return susanFetch(`/api/bugs?project=${encodeURIComponent(projectPath)}`);
}

/**
 * Get project schemas from Susan
 */
async function getSchemas() {
  return susanFetch('/api/schemas');
}

/**
 * Get project structure from Susan
 */
async function getStructure(projectPath) {
  return susanFetch(`/api/structure?project=${encodeURIComponent(projectPath)}`);
}

/**
 * Get project decisions from Susan
 */
async function getDecisions(projectPath) {
  return susanFetch(`/api/decisions?project=${encodeURIComponent(projectPath)}`);
}

/**
 * Get code changes from Susan
 */
async function getCodeChanges(projectPath) {
  return susanFetch(`/api/code-changes?project=${encodeURIComponent(projectPath)}`);
}

/**
 * Search Susan's knowledge base
 */
async function searchKnowledge(query, options = {}) {
  const { category, project } = options;
  let endpoint = `/api/query?q=${encodeURIComponent(query)}`;
  if (category) endpoint += `&category=${encodeURIComponent(category)}`;
  if (project) endpoint += `&project=${encodeURIComponent(project)}`;
  return susanFetch(endpoint);
}

module.exports = {
  susanFetch,
  getKnowledge,
  getTodos,
  getBugs,
  getSchemas,
  getStructure,
  getDecisions,
  getCodeChanges,
  searchKnowledge
};
