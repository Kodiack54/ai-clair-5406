/**
 * Project Setup Service
 * 
 * When a new project/worker is created, automatically:
 * 1. Add the project folder to all tabs (project_paths)
 * 2. Scan for auto-fillable info (git, port, etc.)
 * 3. Start recording everything from the beginning
 */

const supabase = require('../../../shared/db');
const { scanProjectFolder } = require('./autoFill');


/**
 * Add a folder path to a project's paths
 */
async function addProjectPath(projectId, path, label) {
  // Check if already exists
  const { data: existing } = await supabase
    .from('dev_project_paths')
    .select('id')
    .eq('project_id', projectId)
    .eq('path', path)
    .single();

  if (existing) {
    console.log(`[ProjectSetup] Path already exists: ${path}`);
    return existing;
  }

  // Get max sort order
  const { data: maxSort } = await supabase
    .from('dev_project_paths')
    .select('sort_order')
    .eq('project_id', projectId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .single();

  const sort_order = (maxSort?.sort_order || 0) + 1;

  const { data, error } = await supabase
    .from('dev_project_paths')
    .insert({
      project_id: projectId,
      path,
      label: label || path.split('/').pop(),
      sort_order
    })
    .select()
    .single();

  if (error) {
    console.error('[ProjectSetup] Error adding path:', error.message);
    return null;
  }

  console.log(`[ProjectSetup] Added path: ${path}`);
  return data;
}

/**
 * Set up a new project with all necessary paths and auto-detected info
 */
async function setupNewProject(projectId) {
  console.log(`[ProjectSetup] Setting up project: ${projectId}`);

  // Get project info
  const { data: project, error } = await supabase
    .from('dev_projects')
    .select('*')
    .eq('id', projectId)
    .single();

  if (error || !project) {
    console.error('[ProjectSetup] Project not found:', projectId);
    return { success: false, error: 'Project not found' };
  }

  const results = {
    projectId,
    projectName: project.name,
    pathsAdded: [],
    autoFilled: {}
  };

  // If project has a server_path, add it as the main path
  if (project.server_path) {
    const mainPath = await addProjectPath(projectId, project.server_path, project.name);
    if (mainPath) {
      results.pathsAdded.push(project.server_path);
    }

    // Scan for auto-fillable info
    try {
      const scanResult = await scanProjectFolder(project.server_path);
      
      // Update project with detected info (only fill empty fields)
      const updates = {};
      
      if (!project.git_repo && scanResult.detected.git_repo) {
        updates.git_repo = scanResult.detected.git_repo;
      }
      if (!project.port_dev && scanResult.detected.port_dev) {
        updates.port_dev = scanResult.detected.port_dev;
      }

      if (Object.keys(updates).length > 0) {
        await supabase
          .from('dev_projects')
          .update(updates)
          .eq('id', projectId);
        
        results.autoFilled = updates;
        console.log(`[ProjectSetup] Auto-filled: ${JSON.stringify(updates)}`);
      }
    } catch (err) {
      console.error('[ProjectSetup] Scan error:', err.message);
    }
  }

  // If project has a path (used by Clair), ensure it's also added
  if (project.path && project.path !== project.server_path) {
    const clairPath = await addProjectPath(projectId, project.path, `${project.name} (Clair)`);
    if (clairPath) {
      results.pathsAdded.push(project.path);
    }
  }

  return { success: true, ...results };
}

/**
 * Check all projects and set up any that are missing paths
 */
async function setupMissingProjects() {
  console.log('[ProjectSetup] Checking for projects missing paths...');

  // Get all active projects
  const { data: projects, error } = await supabase
    .from('dev_projects')
    .select('id, name, server_path, path')
    .eq('is_active', true);

  if (error) {
    console.error('[ProjectSetup] Error fetching projects:', error.message);
    return { success: false, error: error.message };
  }

  const results = [];

  for (const project of projects || []) {
    // Check if project has any paths
    const { data: paths } = await supabase
      .from('dev_project_paths')
      .select('id')
      .eq('project_id', project.id)
      .limit(1);

    if (!paths || paths.length === 0) {
      // No paths set up - set up this project
      const result = await setupNewProject(project.id);
      results.push(result);
    }
  }

  console.log(`[ProjectSetup] Set up ${results.length} projects`);
  return { success: true, projectsSetUp: results.length, results };
}

module.exports = {
  addProjectPath,
  setupNewProject,
  setupMissingProjects
};
