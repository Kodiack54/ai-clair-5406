/**
 * dayOrganizer.js - Clair's Daytime Organization Service
 *
 * Uses OpenAI (GPT-4o-mini) for fast, cheap tasks:
 * 1. Capture snippets from Susan's knowledge entries
 * 2. Organize and recategorize Susan's buckets
 * 3. Update TODO checklists as items are completed
 * 4. Keep project info current
 *
 * Runs every 30 minutes from 6am-midnight
 */

const cron = require('node-cron');
const supabase = require('../../../shared/db');
const ai = require('../lib/ai');


let isRunning = false;

/**
 * Update schedule job status in database
 */
async function updateJobStatus(jobName, status, result = {}) {
  try {
    await supabase
      .from('dev_ai_clair_schedule')
      .update({
        status,
        last_run_at: new Date().toISOString(),
        last_result: result,
        last_error: result.error || null
      })
      .eq('job_name', jobName);
  } catch (err) {
    console.error('[DayOrganizer] Failed to update job status:', err.message);
  }
}

/**
 * Capture snippets from recent knowledge entries
 * These will be compiled into journal entries at night
 */
async function captureSnippets() {
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const today = new Date().toISOString().split('T')[0];

  // Get recent knowledge that hasn't been captured as snippet
  const { data: knowledge, error } = await supabase
    .from('dev_ai_knowledge')
    .select('*')
    .gte('created_at', thirtyMinutesAgo)
    .is('captured_as_snippet', null);

  if (error || !knowledge || knowledge.length === 0) {
    return { captured: 0 };
  }

  let captured = 0;

  for (const k of knowledge) {
    // Determine snippet type from knowledge category
    const typeMap = {
      'bug-fix': 'bug_fix',
      'feature': 'feature',
      'config': 'config',
      'architecture': 'discussion',
      'workflow': 'discussion',
      'refactor': 'code_change',
      'documentation': 'discussion'
    };

    const snippetType = typeMap[k.category] || 'conversation';

    try {
      // Create snippet
      await supabase
        .from('dev_ai_snippets')
        .insert({
          project_path: k.project_path || '/var/www/NextBid_Dev/dev-studio-5000',
          snippet_type: snippetType,
          content: k.title + (k.summary ? `: ${k.summary}` : ''),
          context: k.content?.slice(0, 500),
          session_id: k.discovered_in || k.source,
          snippet_date: today
        });

      // Mark knowledge as captured
      await supabase
        .from('dev_ai_knowledge')
        .update({ captured_as_snippet: true })
        .eq('id', k.id);

      captured++;

    } catch (err) {
      console.error(`[DayOrganizer] Failed to capture snippet for ${k.id}:`, err.message);
    }
  }

  if (captured > 0) {
    console.log(`[DayOrganizer] Captured ${captured} snippets from knowledge`);
  }

  return { captured };
}

/**
 * Capture snippets from recent todos
 */
async function captureTodoSnippets() {
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const today = new Date().toISOString().split('T')[0];

  // Get recently completed todos
  const { data: todos, error } = await supabase
    .from('dev_ai_todos')
    .select('*')
    .eq('status', 'completed')
    .gte('completed_at', thirtyMinutesAgo);

  if (error || !todos || todos.length === 0) {
    return { captured: 0 };
  }

  let captured = 0;

  for (const todo of todos) {
    // Check if already captured
    const { data: existing } = await supabase
      .from('dev_ai_snippets')
      .select('id')
      .eq('content', `COMPLETED: ${todo.title}`)
      .eq('snippet_date', today)
      .single();

    if (existing) continue;

    try {
      await supabase
        .from('dev_ai_snippets')
        .insert({
          project_path: todo.project_path || '/var/www/NextBid_Dev/dev-studio-5000',
          snippet_type: todo.category === 'bug' ? 'bug_fix' : 'feature',
          content: `COMPLETED: ${todo.title}`,
          context: todo.description,
          snippet_date: today
        });

      captured++;

    } catch (err) {
      console.error(`[DayOrganizer] Failed to capture todo snippet:`, err.message);
    }
  }

  if (captured > 0) {
    console.log(`[DayOrganizer] Captured ${captured} completed todo snippets`);
  }

  return { captured };
}

/**
 * Capture snippets from recent bugs
 */
async function captureBugSnippets() {
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const today = new Date().toISOString().split('T')[0];

  // Get recently fixed bugs
  const { data: bugs, error } = await supabase
    .from('dev_ai_bugs')
    .select('*')
    .eq('status', 'fixed')
    .gte('updated_at', thirtyMinutesAgo);

  if (error || !bugs || bugs.length === 0) {
    return { captured: 0 };
  }

  let captured = 0;

  for (const bug of bugs) {
    const { data: existing } = await supabase
      .from('dev_ai_snippets')
      .select('id')
      .eq('content', `BUG FIXED: ${bug.title}`)
      .eq('snippet_date', today)
      .single();

    if (existing) continue;

    try {
      await supabase
        .from('dev_ai_snippets')
        .insert({
          project_path: bug.project_path || '/var/www/NextBid_Dev/dev-studio-5000',
          snippet_type: 'bug_fix',
          content: `BUG FIXED: ${bug.title}`,
          context: `${bug.description || ''}\nResolution: ${bug.resolution || 'Not documented'}`,
          snippet_date: today
        });

      captured++;

    } catch (err) {
      console.error(`[DayOrganizer] Failed to capture bug snippet:`, err.message);
    }
  }

  if (captured > 0) {
    console.log(`[DayOrganizer] Captured ${captured} bug fix snippets`);
  }

  return { captured };
}

/**
 * Organize Susan's knowledge bucket - recategorize if needed
 */
async function organizeSusanBuckets() {
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  // Get recent uncategorized or miscategorized knowledge
  const { data: items, error } = await supabase
    .from('dev_ai_knowledge')
    .select('*')
    .gte('created_at', thirtyMinutesAgo)
    .or('cataloger.is.null,cataloger.neq.clair-day-organizer');

  if (error || !items || items.length === 0) {
    return { organized: 0 };
  }

  let organized = 0;

  for (const item of items) {
    // Skip if already organized by Clair today
    if (item.cataloger === 'clair-day-organizer') continue;

    try {
      const response = await ai.generate('classification', `
Verify this knowledge item's categorization:

Title: ${item.title}
Current Category: ${item.category || 'none'}
Content Preview: ${(item.summary || item.content || '').slice(0, 300)}

Valid categories: architecture, bug-fix, config, workflow, feature, refactor, documentation, api, database, ui, testing, deployment, security, performance, lesson, idea

Is this correctly categorized? Respond with JSON:
{"correct": true} or {"correct": false, "suggested_category": "..."}
`);

      const result = JSON.parse(response.content);

      if (!result.correct && result.suggested_category) {
        await supabase
          .from('dev_ai_knowledge')
          .update({
            category: result.suggested_category,
            cataloger: 'clair-day-organizer',
            updated_at: new Date().toISOString()
          })
          .eq('id', item.id);

        console.log(`[DayOrganizer] Recategorized: ${item.title} -> ${result.suggested_category}`);
        organized++;
      } else {
        // Mark as reviewed even if correct
        await supabase
          .from('dev_ai_knowledge')
          .update({ cataloger: 'clair-day-organizer' })
          .eq('id', item.id);
      }

    } catch (err) {
      console.error(`[DayOrganizer] Failed to organize ${item.id}:`, err.message);
    }
  }

  return { organized };
}

/**
 * Update TODO.md status - sync with database todos
 */
async function syncTodoStatus() {
  // Get all projects with todos
  const { data: todos, error } = await supabase
    .from('dev_ai_todos')
    .select('project_path, status, category')
    .order('project_path');

  if (error || !todos) return { synced: 0 };

  // Group by project and count
  const projectStats = {};
  for (const todo of todos) {
    const path = todo.project_path || 'global';
    if (!projectStats[path]) {
      projectStats[path] = { pending: 0, in_progress: 0, completed: 0 };
    }
    projectStats[path][todo.status] = (projectStats[path][todo.status] || 0) + 1;
  }

  console.log('[DayOrganizer] Todo stats by project:', projectStats);
  return { synced: Object.keys(projectStats).length, stats: projectStats };
}

/**
 * Main day organization cycle
 */
async function runDayOrganization() {
  if (isRunning) {
    console.log('[DayOrganizer] Already running, skipping...');
    return;
  }

  isRunning = true;
  console.log('[DayOrganizer] === Running Day Organization ===');
  const startTime = Date.now();

  try {
    await updateJobStatus('Organize Susan Buckets', 'running');

    // 1. Capture snippets from various sources
    const knowledgeSnippets = await captureSnippets();
    const todoSnippets = await captureTodoSnippets();
    const bugSnippets = await captureBugSnippets();

    // 2. Organize Susan's buckets
    const organized = await organizeSusanBuckets();

    // 3. Sync todo status
    const todoSync = await syncTodoStatus();

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    const result = {
      success: true,
      duration: `${duration}s`,
      snippets: {
        knowledge: knowledgeSnippets.captured,
        todos: todoSnippets.captured,
        bugs: bugSnippets.captured
      },
      organized: organized.organized,
      todoSync: todoSync.synced
    };

    console.log(`[DayOrganizer] === Completed in ${duration}s ===`);
    await updateJobStatus('Organize Susan Buckets', 'completed', result);

    return result;

  } catch (error) {
    console.error('[DayOrganizer] Error:', error.message);
    await updateJobStatus('Organize Susan Buckets', 'failed', { error: error.message });
    return { success: false, error: error.message };

  } finally {
    isRunning = false;
  }
}

/**
 * Initialize the day scheduler
 */
function initDayScheduler() {
  // Every 30 minutes from 6am to midnight (PST)
  // Cron: minute hour day month weekday
  // */30 6-23 = every 30 min, hours 6-23
  cron.schedule('*/30 6-23 * * *', async () => {
    console.log('[DayOrganizer] Scheduled run triggered');
    await runDayOrganization();
  }, { timezone: 'America/Los_Angeles' });

  console.log('[DayOrganizer] Day scheduler ready - every 30 min (6am-midnight PST)');
}

/**
 * Get scheduler status
 */
function getStatus() {
  return {
    running: isRunning,
    schedule: 'Every 30 min (6am-midnight PST)'
  };
}

module.exports = {
  initDayScheduler,
  runDayOrganization,
  captureSnippets,
  organizeSusanBuckets,
  syncTodoStatus,
  getStatus
};
