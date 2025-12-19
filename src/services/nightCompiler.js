/**
 * nightCompiler.js - Clair's 2am Expert Writing Session
 *
 * Goes PROJECT by PROJECT, TAB by TAB:
 * - Check what's new or changed
 * - Update docs if needed
 * - Write journal entries
 * - Process ideas, decisions, lessons
 *
 * Uses Claude API for quality writing
 * ACCURACY OVER SPEED - No made up fluff
 */

const cron = require('node-cron');
const supabase = require('../../../shared/db');
const ai = require('../lib/ai');


async function updateJobStatus(jobName, status, result = {}) {
  await supabase
    .from('dev_ai_clair_schedule')
    .update({
      status,
      last_run_at: new Date().toISOString(),
      last_result: result,
      last_error: result.error || null
    })
    .eq('job_name', jobName);
}

async function getAllProjects() {
  const { data, error } = await supabase
    .from('dev_projects')
    .select('*')
    .eq('is_active', true);

  if (error || !data || data.length === 0) {
    return [{
      slug: 'dev-studio-5000',
      server_path: '/var/www/NextBid_Dev/dev-studio-5000'
    }];
  }
  return data;
}

async function processTodosTab(projectPath) {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: todos } = await supabase
    .from('dev_ai_todos')
    .select('*')
    .ilike('project_path', `%${projectPath}%`)
    .gte('updated_at', yesterday);

  if (!todos || todos.length === 0) {
    return { updated: false, reason: 'No todo changes' };
  }

  const completed = todos.filter(t => t.status === 'completed');
  const added = todos.filter(t => t.created_at >= yesterday);
  const inProgress = todos.filter(t => t.status === 'in_progress');

  return {
    updated: true,
    completed: completed.length,
    added: added.length,
    inProgress: inProgress.length,
    items: todos.map(t => ({ title: t.title, status: t.status }))
  };
}

async function processKnowledgeTab(projectPath) {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: knowledge } = await supabase
    .from('dev_ai_knowledge')
    .select('*')
    .ilike('project_path', `%${projectPath}%`)
    .gte('created_at', yesterday);

  if (!knowledge || knowledge.length === 0) {
    return { updated: false, reason: 'No new knowledge' };
  }

  const byCategory = {};
  for (const k of knowledge) {
    const cat = k.category || 'general';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(k.title);
  }

  return { updated: true, count: knowledge.length, byCategory };
}

async function processBugsTab(projectPath) {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: bugs } = await supabase
    .from('dev_ai_bugs')
    .select('*')
    .ilike('project_path', `%${projectPath}%`)
    .gte('updated_at', yesterday);

  if (!bugs || bugs.length === 0) {
    return { updated: false, reason: 'No bug changes' };
  }

  return {
    updated: true,
    fixed: bugs.filter(b => b.status === 'fixed').map(b => b.title),
    new: bugs.filter(b => b.status === 'open').map(b => b.title)
  };
}

async function processIdeasTab(projectPath, projectName) {
  const { data: ideas } = await supabase
    .from('dev_ai_ideas')
    .select('*')
    .ilike('project_path', `%${projectPath}%`)
    .eq('status', 'proposed')
    .is('integration_with_existing', null);

  if (!ideas || ideas.length === 0) {
    return { updated: false, reason: 'No new ideas to process' };
  }

  const processed = [];

  for (const idea of ideas) {
    const prompt = `Analyze this idea for ${projectName}:

IDEA: ${idea.title}
DESCRIPTION: ${idea.description}

Provide concise analysis:
1. INTEGRATION: How does this fit with existing system?
2. BENEFITS: What improvements does it bring?
3. CHALLENGES: What obstacles might we face?

Be practical and accurate. No fluff.`;

    try {
      const response = await ai.generate('technical_docs', prompt, { maxTokens: 800 });

      await supabase
        .from('dev_ai_ideas')
        .update({
          integration_with_existing: response.content,
          status: 'exploring',
          explored_at: new Date().toISOString()
        })
        .eq('id', idea.id);

      processed.push(idea.title);
    } catch (err) {
      console.error(`[NightCompiler] Failed to process idea: ${idea.title}`);
    }
  }

  return { updated: processed.length > 0, processed };
}

async function processDecisionsTab(projectPath) {
  const { data: decisions } = await supabase
    .from('dev_ai_decisions')
    .select('*')
    .ilike('project_path', `%${projectPath}%`)
    .eq('status', 'pending');

  if (!decisions || decisions.length === 0) {
    return { updated: false, reason: 'No pending decisions' };
  }

  return {
    updated: true,
    pending: decisions.map(d => ({
      title: d.title,
      pathA: d.path_a_name,
      pathB: d.path_b_name
    }))
  };
}

async function processLessonsTab(projectPath) {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: lessons } = await supabase
    .from('dev_ai_lessons')
    .select('*')
    .ilike('project_path', `%${projectPath}%`)
    .gte('created_at', yesterday);

  if (!lessons || lessons.length === 0) {
    return { updated: false, reason: 'No new lessons' };
  }

  return {
    updated: true,
    lessons: lessons.map(l => ({
      title: l.title,
      solution: l.the_solution?.slice(0, 100)
    }))
  };
}

async function processDocsTab(projectPath) {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: structures } = await supabase
    .from('dev_ai_structures')
    .select('updated_at')
    .ilike('project_path', `%${projectPath}%`)
    .gte('updated_at', yesterday);

  const { data: conventions } = await supabase
    .from('dev_ai_conventions')
    .select('*')
    .ilike('project_path', `%${projectPath}%`)
    .gte('created_at', yesterday);

  const needsUpdate = (structures?.length > 0) || (conventions?.length > 0);

  return {
    updated: needsUpdate,
    structureChanged: structures?.length > 0,
    newConventions: conventions?.length || 0
  };
}

async function processTimelineTab(projectPath) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: completed } = await supabase
    .from('dev_ai_todos')
    .select('*')
    .ilike('project_path', `%${projectPath}%`)
    .eq('status', 'completed')
    .gte('completed_at', sevenDaysAgo)
    .in('category', ['feature', 'phase', 'release']);

  if (!completed || completed.length === 0) {
    return { updated: false, reason: 'No major completions' };
  }

  const added = [];
  for (const todo of completed) {
    const { data: existing } = await supabase
      .from('dev_ai_timeline')
      .select('id')
      .ilike('project_path', `%${projectPath}%`)
      .eq('title', todo.title);

    if (!existing || existing.length === 0) {
      await supabase
        .from('dev_ai_timeline')
        .insert({
          project_path: projectPath,
          milestone_type: todo.category || 'feature',
          title: todo.title,
          achievement: `Completed: ${todo.title}`,
          milestone_date: new Date(todo.completed_at).toISOString().split('T')[0]
        });
      added.push(todo.title);
    }
  }

  return { updated: added.length > 0, added };
}

async function createJournalEntry(projectPath, projectName, tabResults) {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });

  const hasContent = Object.values(tabResults).some(t => t.updated);
  if (!hasContent) {
    console.log(`[NightCompiler] ${projectName}: No changes to journal`);
    return null;
  }

  const prompt = `Create a development journal entry for ${projectName} on ${today}.

TAB SUMMARIES FROM TODAY:

TODOS: ${JSON.stringify(tabResults.todos, null, 2)}

KNOWLEDGE: ${JSON.stringify(tabResults.knowledge, null, 2)}

BUGS: ${JSON.stringify(tabResults.bugs, null, 2)}

IDEAS: ${JSON.stringify(tabResults.ideas, null, 2)}

DECISIONS: ${JSON.stringify(tabResults.decisions, null, 2)}

LESSONS: ${JSON.stringify(tabResults.lessons, null, 2)}

DOCS: ${JSON.stringify(tabResults.docs, null, 2)}

TIMELINE: ${JSON.stringify(tabResults.timeline, null, 2)}

Write a concise journal entry with:
1. OVERVIEW (2-3 sentences)
2. KEY ACCOMPLISHMENTS (bullet points)
3. CHALLENGES (if any)
4. NEXT STEPS

ONLY include sections that have actual data. Be accurate, no fluff.`;

  try {
    const response = await ai.generate('journal_detailed', prompt, { maxTokens: 1500 });

    const { data: journal } = await supabase
      .from('dev_ai_journal')
      .insert({
        project_path: projectPath,
        entry_type: 'work_log',
        title: `Daily Summary: ${today}`,
        content: response.content,
        created_by: 'clair-night-compiler'
      })
      .select()
      .single();

    console.log(`[NightCompiler] Journal created for ${projectName}`);
    return journal;

  } catch (err) {
    console.error(`[NightCompiler] Journal creation failed:`, err.message);
    return null;
  }
}

async function runNightCompilation() {
  console.log('[NightCompiler] ═══════════════════════════════════════════');
  console.log('[NightCompiler] 2am EXPERT WRITING SESSION');
  console.log('[NightCompiler] ═══════════════════════════════════════════');

  const startTime = Date.now();
  const results = { projects: [] };

  try {
    await updateJobStatus('Daily Journal Entry', 'running');

    const projects = await getAllProjects();
    console.log(`[NightCompiler] Processing ${projects.length} projects...`);

    for (const project of projects) {
      const projectPath = project.server_path || project.slug;
      const projectName = project.slug || projectPath.split('/').pop();

      console.log(`\n[NightCompiler] ─── ${projectName} ───`);

      const tabResults = {
        todos: await processTodosTab(projectPath),
        knowledge: await processKnowledgeTab(projectPath),
        bugs: await processBugsTab(projectPath),
        ideas: await processIdeasTab(projectPath, projectName),
        decisions: await processDecisionsTab(projectPath),
        lessons: await processLessonsTab(projectPath),
        docs: await processDocsTab(projectPath),
        timeline: await processTimelineTab(projectPath)
      };

      for (const [tab, result] of Object.entries(tabResults)) {
        if (result.updated) {
          console.log(`[NightCompiler]   ${tab}: UPDATED`);
        }
      }

      const journal = await createJournalEntry(projectPath, projectName, tabResults);

      results.projects.push({
        name: projectName,
        tabs: tabResults,
        journalCreated: !!journal
      });
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n[NightCompiler] ═══════════════════════════════════════════`);
    console.log(`[NightCompiler] COMPLETED in ${duration}s`);
    console.log(`[NightCompiler] ═══════════════════════════════════════════`);

    await updateJobStatus('Daily Journal Entry', 'completed', {
      success: true,
      duration: `${duration}s`,
      projectCount: results.projects.length
    });

    return { success: true, duration, ...results };

  } catch (error) {
    console.error('[NightCompiler] ERROR:', error.message);
    await updateJobStatus('Daily Journal Entry', 'failed', { error: error.message });
    return { success: false, error: error.message };
  }
}

function initNightScheduler() {
  cron.schedule('0 2 * * *', async () => {
    console.log('[NightCompiler] 2am PST - Starting expert writing session');
    await runNightCompilation();
  }, { timezone: 'America/Los_Angeles' });

  console.log('[NightCompiler] Night scheduler ready - 2am PST');
}

module.exports = {
  initNightScheduler,
  runNightCompilation,
  processTodosTab,
  processKnowledgeTab,
  processBugsTab,
  processIdeasTab,
  processDecisionsTab,
  processLessonsTab,
  processDocsTab,
  processTimelineTab
};
