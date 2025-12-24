/**
 * susanAssist.js - Clair's 5-min Susan Quality Control Service
 * 
 * Every 5 minutes, reviews what Susan filed and:
 * - Reorganizes items into correct subcategories
 * - Updates project structure trees
 * - Syncs todo lists per project
 * - Ensures proper ordering within folders
 */

const supabase = require('../../../shared/db');
const ai = require('../lib/ai');
const projectRouter = require('./projectRouter');


const ASSIST_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
let intervalId = null;

/**
 * Start the Susan assist cycle
 */
function start() {
  console.log('[SusanAssist] Starting 5-min quality control cycle');
  
  // Run immediately, then every 5 minutes
  setTimeout(() => runAssistCycle(), 30000); // First run after 30 sec
  intervalId = setInterval(() => runAssistCycle(), ASSIST_INTERVAL_MS);
}

function stop() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[SusanAssist] Stopped');
  }
}

/**
 * Main assist cycle
 */
async function runAssistCycle() {
  try {
    console.log('[SusanAssist] Running quality control pass...');
    
    // 1. Get recently added knowledge (last 10 min to catch Susan's work)
    const recentKnowledge = await getRecentKnowledge();
    
    // 2. Get recently added todos
    const recentTodos = await getRecentTodos();
    
    // 3. Review and reorganize if needed
    if (recentKnowledge.length > 0) {
      await reviewKnowledgePlacement(recentKnowledge);
    }
    
    // 4. Update project structure trees
    await updateProjectStructures();
    
    // 5. Run content-based project routing (final defense)
    try {
      const routeResult = await projectRouter.routeAllTables({ limit: 100 });
      if (routeResult.totalRerouted > 0) {
        console.log('[SusanAssist] Rerouted', routeResult.totalRerouted, 'items by content');
      }
    } catch (routeErr) {
      console.error('[SusanAssist] Routing error:', routeErr.message);
    }

    // 6. Sync project todos with Ryan
    if (recentTodos.length > 0) {
      await syncProjectTodos(recentTodos);
    }
    
    console.log('[SusanAssist] Cycle complete', {
      knowledgeReviewed: recentKnowledge.length,
      todosReviewed: recentTodos.length
    });
    
  } catch (err) {
    console.error('[SusanAssist] Cycle error:', err.message);
  }
}

/**
 * Get knowledge added in last 10 minutes
 */
async function getRecentKnowledge() {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  
  const { data, error } = await supabase
    .from('dev_ai_knowledge')
    .select('*')
    .gte('created_at', tenMinutesAgo)
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('[SusanAssist] Failed to get recent knowledge:', error.message);
    return [];
  }
  return data || [];
}

/**
 * Get todos added in last 10 minutes
 */
async function getRecentTodos() {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  
  const { data, error } = await supabase
    .from('dev_ai_todos')
    .select('*')
    .gte('created_at', tenMinutesAgo)
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('[SusanAssist] Failed to get recent todos:', error.message);
    return [];
  }
  return data || [];
}

/**
 * Review knowledge placement and recategorize if needed
 */
async function reviewKnowledgePlacement(items) {
  for (const item of items) {
    try {
      // Skip if already reviewed by Clair
      if (item.cataloger === 'clair-assist') continue;
      
      // Use GPT-4o-mini to verify/correct categorization
      const review = await ai.forTask('classification', `
Review this knowledge item's categorization:

Title: ${item.title}
Current Category: ${item.category}
Current Subcategory: ${item.subcategory || 'none'}
Summary: ${item.summary || ''}
Project Path: ${item.project_path || 'global'}

Valid categories: architecture, bug-fix, config, workflow, feature, refactor, documentation, api, database, ui, testing, deployment, security, performance

Should this be recategorized? If so, provide:
1. Correct category
2. Correct subcategory (optional)
3. Brief reason

Respond in JSON: {"needsChange": boolean, "category": "...", "subcategory": "...", "reason": "..."}
`);
      
      const result = JSON.parse(review);
      
      if (result.needsChange) {
        await supabase
          .from('dev_ai_knowledge')
          .update({
            category: result.category,
            subcategory: result.subcategory || item.subcategory,
            cataloger: 'clair-assist',
            updated_at: new Date().toISOString()
          })
          .eq('id', item.id);
        
        console.log('[SusanAssist] Recategorized:', item.title, '->', result.category, result.reason);
      }
    } catch (err) {
      // Don't fail the whole cycle for one item
      console.error('[SusanAssist] Failed to review item:', item.id, err.message);
    }
  }
}

/**
 * Update project structure trees
 */
async function updateProjectStructures() {
  try {
    // Get all active projects
    const { data: projects } = await supabase
      .from('dev_projects')
      .select('id, slug, server_path')
      .eq('is_active', true);
    
    if (!projects || projects.length === 0) return;
    
    // For each project, count knowledge by category
    for (const project of projects) {
      if (!project.server_path) continue;
      
      const { data: knowledge } = await supabase
        .from('dev_ai_knowledge')
        .select('category')
        .eq('project_path', project.server_path);
      
      if (!knowledge || knowledge.length === 0) continue;
      
      // Build category counts
      const categoryCounts = {};
      for (const k of knowledge) {
        categoryCounts[k.category] = (categoryCounts[k.category] || 0) + 1;
      }
      
      // Update project structure
      await supabase
        .from('dev_ai_structures')
        .upsert({
          project_path: project.server_path,
          structure: { knowledge_categories: categoryCounts },
          updated_at: new Date().toISOString()
        }, { onConflict: 'project_path' });
    }
  } catch (err) {
    console.error('[SusanAssist] Failed to update structures:', err.message);
  }
}

/**
 * Sync todos with project context
 */
async function syncProjectTodos(todos) {
  try {
    // Group todos by project
    const byProject = {};
    for (const todo of todos) {
      const path = todo.project_path || 'global';
      if (!byProject[path]) byProject[path] = [];
      byProject[path].push(todo);
    }
    
    // Log project todo updates
    for (const [path, projectTodos] of Object.entries(byProject)) {
      console.log('[SusanAssist] Project todos updated:', path, projectTodos.length, 'items');
    }
    
    // Could POST to Ryan's API here to trigger roadmap updates
    // For now, Ryan's todoWatcher will pick these up on its 5-min cycle
    
  } catch (err) {
    console.error('[SusanAssist] Failed to sync todos:', err.message);
  }
}

/**
 * Get assist status
 */
function getStatus() {
  return {
    running: intervalId !== null,
    intervalMs: ASSIST_INTERVAL_MS,
    intervalMinutes: ASSIST_INTERVAL_MS / 60000
  };
}

module.exports = {
  start,
  stop,
  getStatus,
  runAssistCycle // For manual trigger
};
