/**
 * Auto-Fill Service
 * 
 * Scans project folders to detect and extract:
 * - Git remote URL
 * - Dev port number
 * - Other project metadata
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * Extract git remote URL from .git/config
 */
async function getGitRemote(projectPath) {
  try {
    const gitConfigPath = path.join(projectPath, '.git', 'config');
    const content = await fs.readFile(gitConfigPath, 'utf8');
    
    // Parse git config for remote "origin" url
    const originMatch = content.match(/\[remote "origin"\][^\[]*url\s*=\s*(.+)/);
    if (originMatch) {
      return originMatch[1].trim();
    }
    return null;
  } catch (error) {
    // .git/config doesn't exist or can't be read
    return null;
  }
}

/**
 * Extract port from package.json scripts
 */
async function getPortFromPackageJson(projectPath) {
  try {
    const packagePath = path.join(projectPath, 'package.json');
    const content = await fs.readFile(packagePath, 'utf8');
    const pkg = JSON.parse(content);
    
    // Check scripts for port patterns
    const scripts = pkg.scripts || {};
    for (const [name, script] of Object.entries(scripts)) {
      if (typeof script !== 'string') continue;
      
      // Match patterns like PORT=5000, --port 5000, -p 5000
      const portMatch = script.match(/(?:PORT=|--port[= ]|-p[= ])(\d{4,5})/i);
      if (portMatch) {
        return parseInt(portMatch[1], 10);
      }
    }
    
    // Check for port in main config
    if (pkg.config?.port) {
      return pkg.config.port;
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Extract port from .env file
 */
async function getPortFromEnv(projectPath) {
  try {
    const envPath = path.join(projectPath, '.env');
    const content = await fs.readFile(envPath, 'utf8');
    
    // Match PORT=5000 or similar
    const portMatch = content.match(/^PORT=(\d{4,5})/m);
    if (portMatch) {
      return parseInt(portMatch[1], 10);
    }
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Extract port from pm2.config.js
 */
async function getPortFromPm2Config(projectPath) {
  try {
    const pm2Path = path.join(projectPath, 'pm2.config.js');
    const content = await fs.readFile(pm2Path, 'utf8');
    
    // Match PORT: 5000 or port: 5000
    const portMatch = content.match(/(?:PORT|port)['":\s]+(\d{4,5})/);
    if (portMatch) {
      return parseInt(portMatch[1], 10);
    }
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Get project name from package.json
 */
async function getProjectName(projectPath) {
  try {
    const packagePath = path.join(projectPath, 'package.json');
    const content = await fs.readFile(packagePath, 'utf8');
    const pkg = JSON.parse(content);
    return pkg.name || null;
  } catch (error) {
    return null;
  }
}

/**
 * Get project description from package.json
 */
async function getProjectDescription(projectPath) {
  try {
    const packagePath = path.join(projectPath, 'package.json');
    const content = await fs.readFile(packagePath, 'utf8');
    const pkg = JSON.parse(content);
    return pkg.description || null;
  } catch (error) {
    return null;
  }
}

/**
 * Scan a project folder and return auto-detected information
 */
async function scanProjectFolder(projectPath) {
  console.log(`[AutoFill] Scanning: ${projectPath}`);
  
  const results = {
    path: projectPath,
    detected: {}
  };

  // Get git remote
  const gitRemote = await getGitRemote(projectPath);
  if (gitRemote) {
    results.detected.git_repo = gitRemote;
    console.log(`[AutoFill] Found git remote: ${gitRemote}`);
  }

  // Get port (try multiple sources)
  let port = await getPortFromEnv(projectPath);
  if (!port) port = await getPortFromPackageJson(projectPath);
  if (!port) port = await getPortFromPm2Config(projectPath);
  
  if (port) {
    results.detected.port_dev = port;
    console.log(`[AutoFill] Found dev port: ${port}`);
  }

  // Get project name
  const name = await getProjectName(projectPath);
  if (name) {
    results.detected.name = name;
  }

  // Get description
  const description = await getProjectDescription(projectPath);
  if (description) {
    results.detected.description = description;
  }

  // Server path is the folder itself
  results.detected.server_path = projectPath;

  return results;
}

module.exports = {
  scanProjectFolder,
  getGitRemote,
  getPortFromPackageJson,
  getPortFromEnv,
  getProjectName
};
