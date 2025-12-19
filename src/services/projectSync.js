/**
 * Project Sync Service
 * 
 * Keeps project main records up-to-date by scanning folders
 * for changes to port, git, etc.
 * 
 * Runs as part of daily job or on-demand.
 */

const supabase = require('../../../shared/db');
const { scanProjectFolder } = require('./autoFill');


/**
 * Sync a single project's info from its folder
 */
async function syncProject(projectId) {
  // Get current project data
  const { data: project, error } = await supabase
    .from('dev_projects')
    .select('*')
    .eq('id', projectId)
    .single();

  if (error || !project) {
    console.error('[ProjectSync] Project not found:', projectId);
    return { success: false, error: 'Project not found' };
  }

  if (!project.server_path) {
    return { success: false, error: 'No server_path set' };
  }

  // Scan the folder for current info
  const scanResult = await scanProjectFolder(project.server_path);
  const detected = scanResult.detected;

  // Compare and find changes
  const updates = {};
  const changes = [];

  if (detected.git_repo && detected.git_repo !== project.git_repo) {
    updates.git_repo = detected.git_repo;
    changes.push(`git_repo: ${project.git_repo || 'empty'} → ${detected.git_repo}`);
  }

  if (detected.port_dev && detected.port_dev !== project.port_dev) {
    updates.port_dev = detected.port_dev;
    changes.push(`port_dev: ${project.port_dev || 'empty'} → ${detected.port_dev}`);
  }

  if (detected.name && detected.name !== project.name && !project.name) {
    // Only update name if it was empty
    updates.name = detected.name;
    changes.push(`name: empty → ${detected.name}`);
  }

  // Apply updates if any
  if (Object.keys(updates).length > 0) {
    updates.updated_at = new Date().toISOString();
    
    const { error: updateError } = await supabase
      .from('dev_projects')
      .update(updates)
      .eq('id', projectId);

    if (updateError) {
      console.error('[ProjectSync] Update error:', updateError.message);
      return { success: false, error: updateError.message };
    }

    console.log(`[ProjectSync] Updated ${project.name}: ${changes.join(', ')}`);
    return { success: true, project: project.name, changes };
  }

  return { success: true, project: project.name, changes: [], message: 'No changes detected' };
}

/**
 * Sync ALL active projects
 */
async function syncAllProjects() {
  console.log('[ProjectSync] Syncing all projects...');
  
  const { data: projects, error } = await supabase
    .from('dev_projects')
    .select('id, name, server_path')
    .eq('is_active', true)
    .not('server_path', 'is', null);

  if (error) {
    console.error('[ProjectSync] Error fetching projects:', error.message);
    return { success: false, error: error.message };
  }

  const results = [];
  
  for (const project of projects || []) {
    const result = await syncProject(project.id);
    if (result.changes && result.changes.length > 0) {
      results.push(result);
    }
  }

  console.log(`[ProjectSync] Done. ${results.length} projects updated.`);
  return { success: true, updated: results.length, results };
}

module.exports = {
  syncProject,
  syncAllProjects
};
