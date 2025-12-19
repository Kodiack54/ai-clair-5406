/**
 * Daily Summary Service
 * 
 * At 2am PST daily:
 * 1. SYNC all project main records (port, git, etc from folders)
 * 2. Gather ALL journal entries from the past 24 hours
 * 3. Create SEPARATE docs per category (work_log, decisions, lessons, ideas)
 * 4. ARCHIVE original entries (not delete) - keep raw data accessible
 * 5. Be detailed but ACCURATE - no fluff
 */

const cron = require('node-cron');
const supabase = require('../../../shared/db');
const ai = require('../lib/ai');
const { syncAllProjects } = require('./projectSync');


async function getRecentJournalEntries(projectPath) {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  
  const { data, error } = await supabase
    .from('dev_ai_journal')
    .select('*')
    .eq('project_path', projectPath)
    .gte('created_at', twentyFourHoursAgo)
    .neq('created_by', 'clair-daily-summary')
    .or('is_archived.is.null,is_archived.eq.false')
    .order('created_at', { ascending: true });

  if (error) return [];
  return data || [];
}

async function getActiveProjects() {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  
  const { data, error } = await supabase
    .from('dev_ai_journal')
    .select('project_path')
    .gte('created_at', twentyFourHoursAgo)
    .neq('created_by', 'clair-daily-summary')
    .or('is_archived.is.null,is_archived.eq.false');

  if (error) return [];
  return [...new Set(data?.map(e => e.project_path) || [])];
}

async function archiveEntries(entryIds, summaryId) {
  if (entryIds.length === 0) return;
  await supabase
    .from('dev_ai_journal')
    .update({
      is_archived: true,
      archived_at: new Date().toISOString(),
      archived_into: summaryId
    })
    .in('id', entryIds);
  console.log(`[DailySummary] Archived ${entryIds.length} entries`);
}

async function generateCategoryDoc(projectName, category, entries, date) {
  if (entries.length === 0) return null;

  const categoryTitles = {
    work_log: 'Work Log',
    decision: 'Decisions',
    idea: 'Ideas & Proposals',
    lesson: 'Lessons Learned'
  };

  const formattedEntries = entries.map(e => {
    const time = new Date(e.created_at).toLocaleTimeString('en-US', { 
      hour: '2-digit', minute: '2-digit' 
    });
    return `### ${time} - ${e.title}\n${e.content}\n`;
  }).join('\n');

  const prompt = `Organize these ${categoryTitles[category]} entries for "${projectName}" from ${date}.

RULES:
- ONLY use the information provided - do NOT invent anything
- Keep ALL important details
- Organize logically with clear structure
- Include timestamps
- Remove redundancy
- Be concise but complete

Raw entries:
${formattedEntries}

Create a clean, organized document:`;

  try {
    const response = await ai.generate('journal_detailed', prompt, { maxTokens: 1500 });
    return response.content;
  } catch (error) {
    return formattedEntries;
  }
}

async function createVersionedDoc(projectPath, category, title, content) {
  const { data, error } = await supabase
    .from('dev_ai_journal')
    .insert({
      project_path: projectPath,
      entry_type: category,
      title,
      content,
      created_by: 'clair-daily-summary'
    })
    .select()
    .single();

  if (error) return null;
  return data;
}

async function runDailySummary() {
  console.log('[DailySummary] === 2am Daily Job Starting ===');
  const startTime = Date.now();
  const results = { projectSync: null, docs: [] };

  try {
    // STEP 1: Sync all project main records from folders
    console.log('[DailySummary] Step 1: Syncing project info...');
    results.projectSync = await syncAllProjects();

    // STEP 2: Process journal entries
    console.log('[DailySummary] Step 2: Processing journal entries...');
    const projectPaths = await getActiveProjects();
    
    if (projectPaths.length === 0) {
      console.log('[DailySummary] No entries to process');
    } else {
      const today = new Date().toLocaleDateString('en-US', { 
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
      });

      for (const projectPath of projectPaths) {
        const entries = await getRecentJournalEntries(projectPath);
        if (entries.length === 0) continue;

        const projectName = projectPath.split('/').pop();
        const projectResult = { project: projectName, entriesProcessed: entries.length, docsCreated: [] };

        const categories = {
          work_log: entries.filter(e => e.entry_type === 'work_log'),
          decision: entries.filter(e => e.entry_type === 'decision'),
          idea: entries.filter(e => e.entry_type === 'idea'),
          lesson: entries.filter(e => e.entry_type === 'lesson')
        };

        const categoryLabels = {
          work_log: '📋 Work Log',
          decision: '🎯 Decisions',
          idea: '💡 Ideas',
          lesson: '📚 Lessons'
        };

        const createdDocs = [];
        for (const [category, catEntries] of Object.entries(categories)) {
          if (catEntries.length === 0) continue;

          const docContent = await generateCategoryDoc(projectName, category, catEntries, today);
          if (!docContent) continue;

          const doc = await createVersionedDoc(
            projectPath, category,
            `${categoryLabels[category]} - ${today}`,
            docContent
          );

          if (doc) {
            createdDocs.push(doc.id);
            projectResult.docsCreated.push(category);
          }
        }

        if (createdDocs.length > 0) {
          await archiveEntries(entries.map(e => e.id), createdDocs[0]);
        }

        results.docs.push(projectResult);
        console.log(`[DailySummary] ${projectName}: ${entries.length} entries -> ${createdDocs.length} docs`);
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[DailySummary] === Done in ${duration}s ===`);

    return { success: true, duration: `${duration}s`, ...results };
  } catch (error) {
    console.error('[DailySummary] Error:', error.message);
    return { success: false, error: error.message };
  }
}

function initScheduler() {
  cron.schedule('0 2 * * *', async () => {
    console.log('[DailySummary] 2am PST triggered');
    await runDailySummary();
  }, { timezone: 'America/Los_Angeles' });

  console.log('[DailySummary] Scheduler ready - 2am PST');
}

module.exports = { initScheduler, runDailySummary };
