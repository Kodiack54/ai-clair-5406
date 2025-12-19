/**
 * Clair Cleanup Service
 * Garbage collection for AI data - keeps the DB lean
 *
 * Runs periodically to:
 * - Purge processed session raw data
 * - Dedupe similar knowledge entries
 * - Clean up old applied corrections
 * - Condense session summaries
 */

const supabase = require('../../../shared/db');


// Cleanup thresholds
const THRESHOLDS = {
  sessionRawDataDays: 7,      // Delete raw session data after 7 days if knowledge extracted
  appliedCorrectionsDays: 30, // Delete applied corrections after 30 days
  duplicateSimilarity: 0.85,  // 85% similar = duplicate
  minKnowledgeAge: 1          // Don't touch knowledge less than 1 day old
};

/**
 * Run all cleanup tasks
 */
async function runCleanup() {
  console.log('[Clair:Cleanup] Starting cleanup cycle...');

  const results = {
    timestamp: new Date().toISOString(),
    tasks: {}
  };

  try {
    // 1. Clean old session raw data
    results.tasks.sessionRawData = await cleanSessionRawData();

    // 2. Clean applied corrections
    results.tasks.appliedCorrections = await cleanAppliedCorrections();

    // 3. Find and flag duplicate knowledge
    results.tasks.duplicateKnowledge = await flagDuplicateKnowledge();

    // 4. Condense old sessions into summaries
    results.tasks.condenseSessions = await condenseSessions();

    console.log('[Clair:Cleanup] Cleanup complete', results);
  } catch (err) {
    console.error('[Clair:Cleanup] Cleanup failed:', err.message);
    results.error = err.message;
  }

  return results;
}

/**
 * Clean raw session data older than threshold where knowledge has been extracted
 */
async function cleanSessionRawData() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - THRESHOLDS.sessionRawDataDays);

  try {
    // Find sessions with extracted knowledge that are old
    const { data: oldSessions, error: fetchErr } = await supabase
      .from('dev_ai_sessions')
      .select('id, created_at, summary')
      .lt('created_at', cutoff.toISOString())
      .not('summary', 'is', null) // Has been summarized = knowledge extracted
      .limit(100);

    if (fetchErr) throw fetchErr;
    if (!oldSessions || oldSessions.length === 0) {
      return { deleted: 0, message: 'No old sessions to clean' };
    }

    const sessionIds = oldSessions.map(s => s.id);

    // Delete raw messages for these sessions
    const { error: deleteErr, count } = await supabase
      .from('dev_ai_messages')
      .delete()
      .in('session_id', sessionIds);

    if (deleteErr) throw deleteErr;

    console.log(`[Clair:Cleanup] Deleted raw messages for ${sessionIds.length} old sessions`);

    return {
      deleted: count || sessionIds.length,
      sessions: sessionIds.length,
      message: `Cleaned raw data for ${sessionIds.length} sessions`
    };
  } catch (err) {
    console.error('[Clair:Cleanup] Session cleanup error:', err.message);
    return { deleted: 0, error: err.message };
  }
}

/**
 * Clean up old applied/rejected corrections
 */
async function cleanAppliedCorrections() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - THRESHOLDS.appliedCorrectionsDays);

  try {
    const { error, count } = await supabase
      .from('dev_ai_corrections')
      .delete()
      .in('status', ['applied', 'rejected'])
      .lt('created_at', cutoff.toISOString());

    if (error) throw error;

    return {
      deleted: count || 0,
      message: `Deleted ${count || 0} old corrections`
    };
  } catch (err) {
    console.error('[Clair:Cleanup] Corrections cleanup error:', err.message);
    return { deleted: 0, error: err.message };
  }
}

/**
 * Find duplicate knowledge entries and flag for merge
 */
async function flagDuplicateKnowledge() {
  try {
    // Get recent knowledge entries
    const { data: knowledge, error } = await supabase
      .from('dev_ai_knowledge')
      .select('id, title, summary, category, project_path')
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) throw error;
    if (!knowledge || knowledge.length < 2) {
      return { flagged: 0, message: 'Not enough entries to check' };
    }

    const duplicates = [];
    const checked = new Set();

    // Simple similarity check based on title
    for (let i = 0; i < knowledge.length; i++) {
      if (checked.has(knowledge[i].id)) continue;

      const entry = knowledge[i];
      const similar = [];

      for (let j = i + 1; j < knowledge.length; j++) {
        if (checked.has(knowledge[j].id)) continue;

        const other = knowledge[j];

        // Same category and similar title?
        if (entry.category === other.category) {
          const similarity = calculateSimilarity(
            entry.title.toLowerCase(),
            other.title.toLowerCase()
          );

          if (similarity >= THRESHOLDS.duplicateSimilarity) {
            similar.push({ id: other.id, title: other.title, similarity });
            checked.add(other.id);
          }
        }
      }

      if (similar.length > 0) {
        duplicates.push({
          primary: { id: entry.id, title: entry.title },
          duplicates: similar
        });
        checked.add(entry.id);
      }
    }

    // Flag duplicates for merge review
    for (const dup of duplicates) {
      await supabase
        .from('dev_ai_corrections')
        .insert({
          item_type: 'knowledge',
          item_id: dup.primary.id,
          correction_type: 'merge',
          details: {
            primary_title: dup.primary.title,
            duplicates: dup.duplicates,
            auto_detected: true
          },
          status: 'pending',
          created_by: 'clair-cleanup'
        });
    }

    return {
      flagged: duplicates.length,
      totalDuplicates: duplicates.reduce((sum, d) => sum + d.duplicates.length, 0),
      message: `Flagged ${duplicates.length} potential duplicate groups`
    };
  } catch (err) {
    console.error('[Clair:Cleanup] Duplicate detection error:', err.message);
    return { flagged: 0, error: err.message };
  }
}

/**
 * Condense old sessions into brief summaries
 */
async function condenseSessions() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14); // Sessions older than 14 days

  try {
    // Find sessions without summaries
    const { data: sessions, error } = await supabase
      .from('dev_ai_sessions')
      .select('id, project_path, created_at, ended_at')
      .lt('created_at', cutoff.toISOString())
      .is('summary', null)
      .limit(20);

    if (error) throw error;
    if (!sessions || sessions.length === 0) {
      return { condensed: 0, message: 'No sessions need condensing' };
    }

    let condensed = 0;

    for (const session of sessions) {
      // Get message count for this session
      const { count } = await supabase
        .from('dev_ai_messages')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', session.id);

      // Create a basic summary
      const summary = `Session from ${new Date(session.created_at).toLocaleDateString()} with ${count || 0} messages`;

      // Update session with summary
      await supabase
        .from('dev_ai_sessions')
        .update({ summary })
        .eq('id', session.id);

      condensed++;
    }

    return {
      condensed,
      message: `Condensed ${condensed} old sessions`
    };
  } catch (err) {
    console.error('[Clair:Cleanup] Session condense error:', err.message);
    return { condensed: 0, error: err.message };
  }
}

/**
 * Calculate simple string similarity (Jaccard index on words)
 */
function calculateSimilarity(str1, str2) {
  const words1 = new Set(str1.split(/\s+/));
  const words2 = new Set(str2.split(/\s+/));

  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

/**
 * Get cleanup status/stats
 */
async function getCleanupStats() {
  try {
    const stats = {
      thresholds: THRESHOLDS,
      pending: {}
    };

    // Count pending corrections
    const { count: pendingCorrections } = await supabase
      .from('dev_ai_corrections')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    stats.pending.corrections = pendingCorrections || 0;

    // Count old sessions without summaries
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 14);

    const { count: oldSessions } = await supabase
      .from('dev_ai_sessions')
      .select('*', { count: 'exact', head: true })
      .lt('created_at', cutoff.toISOString())
      .is('summary', null);

    stats.pending.uncondensedSessions = oldSessions || 0;

    return stats;
  } catch (err) {
    return { error: err.message };
  }
}

module.exports = {
  runCleanup,
  getCleanupStats,
  cleanSessionRawData,
  cleanAppliedCorrections,
  flagDuplicateKnowledge,
  condenseSessions,
  THRESHOLDS
};
