import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import { exec, spawn, ChildProcess } from 'child_process';
import * as os from 'os';
import { profileDb } from './database';

// Path to preferences and settings files
const PREFS_PATH = path.join(app.getPath('userData'), 'preferences.json');
const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');
const DEFAULT_CONFIG_PATH = path.join(app.getPath('appData'), 'Claude', 'claude_desktop_config.json');
const DEFAULT_BACKUP_PATH = path.join(path.dirname(__dirname), '..', 'config-backups');

// Inspector process management
let inspectorProcesses: Record<string, { process: ChildProcess, url: string }> = {};

// Keep a global reference of the window object to prevent garbage collection
let mainWindow: BrowserWindow | null = null;

// Load preferences from disk
async function loadPreferences() {
  try {
    const data = await fs.readFile(PREFS_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    return { lastOpenedFile: null };
  }
}

// Save preferences to disk
async function savePreferences(prefs: { lastOpenedFile: string | null }) {
  await fs.writeFile(PREFS_PATH, JSON.stringify(prefs, null, 2));
}

// Load settings from disk
async function loadSettings() {
  try {
    const data = await fs.readFile(SETTINGS_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    return { 
      configPath: DEFAULT_CONFIG_PATH,
      backupPath: DEFAULT_BACKUP_PATH,
      claudePath: '' // Empty string means use auto-detection
    };
  }
}

// Save settings to disk
async function saveSettings(settings: { configPath?: string, backupPath?: string, claudePath?: string }) {
  // Ensure we don't lose existing settings
  const currentSettings = await loadSettings();
  const updatedSettings = { ...currentSettings, ...settings };
  await fs.writeFile(SETTINGS_PATH, JSON.stringify(updatedSettings, null, 2));
  return true;
}

// Create a backup of the config file
async function createBackup(filePath: string) {
  try {
    // Load settings to get backup path
    const settings = await loadSettings();
    const backupPath = settings.backupPath || DEFAULT_BACKUP_PATH;
    
    // Create backup directory if it doesn't exist
    if (!fsSync.existsSync(backupPath)) {
      await fs.mkdir(backupPath, { recursive: true });
    }
    
    // Read the source file
    const content = await fs.readFile(filePath, 'utf-8');
    
    // Generate backup filename with timestamp
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
    const fileName = path.basename(filePath);
    const backupFileName = `${path.parse(fileName).name}_${timestamp}${path.parse(fileName).ext}`;
    const backupFilePath = path.join(backupPath, backupFileName);
    
    // Write the backup file
    await fs.writeFile(backupFilePath, content, 'utf-8');
    
    return { success: true, backupFilePath };
  } catch (err) {
    console.error('Error creating backup:', err);
    return { success: false, error: err };
  }
}

// Profile Management Functions

// Create a new profile
ipcMain.handle('create-profile', async (_, { name, configPath, backupPath, mcpClientPath }) => {
  try {
    return profileDb.createProfile(name, configPath, backupPath, mcpClientPath);
  } catch (err: any) {
    console.error('Error creating profile:', err);
    throw new Error(`Failed to create profile: ${err.message}`);
  }
});

// Get all profiles
ipcMain.handle('get-all-profiles', async () => {
  try {
    return profileDb.getAllProfiles();
  } catch (err: any) {
    console.error('Error getting profiles:', err);
    throw new Error(`Failed to get profiles: ${err.message}`);
  }
});

// Get a specific profile
ipcMain.handle('get-profile', async (_, id) => {
  try {
    return profileDb.getProfile(id);
  } catch (err: any) {
    console.error('Error getting profile:', err);
    throw new Error(`Failed to get profile: ${err.message}`);
  }
});

// Switch to a different profile
ipcMain.handle('switch-profile', async (_, id) => {
  try {
    const profile = profileDb.getProfile(id);
    if (!profile) {
      throw new Error('Profile not found');
    }

    // Get the latest configuration for this profile
    const configContent = profileDb.getLatestConfiguration(id);
    if (!configContent) {
      throw new Error('No configuration found for this profile');
    }

    // Parse the configuration to ensure it's valid
    let configObject;
    try {
      configObject = JSON.parse(configContent);
    } catch (parseErr) {
      console.error('Invalid JSON in profile configuration:', parseErr);
      throw new Error('Invalid configuration format');
    }

    // Ensure the configuration has a valid mcpServers object
    if (!configObject.mcpServers || typeof configObject.mcpServers !== 'object') {
      console.warn('Configuration missing mcpServers object, adding empty one');
      configObject.mcpServers = {};
    }

    // Create a backup of the current config file if it exists
    if (fsSync.existsSync(profile.config_path)) {
      const backupResult = await createBackup(profile.config_path);
      if (!backupResult.success) {
        throw new Error(`Failed to create backup: ${backupResult.error}`);
      }
    }

    // Ensure the config directory exists
    const configDir = path.dirname(profile.config_path);
    await fs.mkdir(configDir, { recursive: true });

    // Write the profile's configuration to the config path
    const finalContent = JSON.stringify(configObject, null, 2);
    await fs.writeFile(profile.config_path, finalContent, 'utf-8');

    // Update settings with the profile's paths
    await saveSettings({
      configPath: profile.config_path,
      backupPath: profile.backup_path,
      claudePath: profile.mcp_client_path || undefined
    });

    // Update preferences
    await savePreferences({ lastOpenedFile: profile.config_path });

    return { success: true };
  } catch (err: any) {
    console.error('Error switching profile:', err);
    return { success: false, error: err.message };
  }
});

// Save current configuration to a profile
ipcMain.handle('save-profile', async (_, { id, content }) => {
  try {
    profileDb.saveConfiguration(id, content);
    return { success: true };
  } catch (err: any) {
    console.error('Error saving profile configuration:', err);
    return { success: false, error: err.message };
  }
});

// Create a new profile as a copy of an existing one
ipcMain.handle('remix-profile', async (_, { id, newName }) => {
  try {
    const sourceProfile = profileDb.getProfile(id);
    if (!sourceProfile) {
      throw new Error('Source profile not found');
    }

    const content = profileDb.getLatestConfiguration(id);
    if (!content) {
      throw new Error('No configuration found for source profile');
    }

    // Create new profile with same paths
    const newId = profileDb.createProfile(
      newName,
      sourceProfile.config_path,
      sourceProfile.backup_path,
      sourceProfile.mcp_client_path
    );

    // Save the configuration to the new profile
    profileDb.saveConfiguration(newId, content);

    return { success: true, id: newId };
  } catch (err: any) {
    console.error('Error remixing profile:', err);
    return { success: false, error: err.message };
  }
});

// Delete a profile
ipcMain.handle('delete-profile', async (_, id) => {
  try {
    profileDb.deleteProfile(id);
    return { success: true };
  } catch (err: any) {
    console.error('Error deleting profile:', err);
    return { success: false, error: err.message };
  }
});

// Create the main window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Load the index.html file
  const startUrl = process.env.NODE_ENV === 'development'
    ? 'http://localhost:3000'
    : `file://${path.join(__dirname, '..', 'index.html')}`;

  mainWindow.loadURL(startUrl);

  // Open external links in the default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Emitted when the window is closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (mainWindow === null) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle file loading
ipcMain.handle('load-config', async () => {
  if (!mainWindow) return null;

  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Configuration File',
    filters: [{ name: 'JSON Files', extensions: ['json'] }],
    properties: ['openFile']
  });

  if (canceled || filePaths.length === 0) {
    return null;
  }

  const filePath = filePaths[0];
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    
    // Save the last opened file in preferences
    await savePreferences({ lastOpenedFile: filePath });
    
    return { filePath, content };
  } catch (err) {
    console.error('Error reading file:', err);
    throw new Error(`Failed to read file: ${err}`);
  }
});

// Handle file loading by path
ipcMain.handle('load-config-by-path', async (_, filePath) => {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    
    // Save the last opened file in preferences
    await savePreferences({ lastOpenedFile: filePath });
    
    return { filePath, content };
  } catch (err) {
    console.error('Error reading file:', err);
    throw new Error(`Failed to read file: ${err}`);
  }
});

// Handle file saving
ipcMain.handle('save-config', async (_, { content, filePath }) => {
  if (!mainWindow) return null;

  let targetPath = filePath;
  
  if (!targetPath) {
    const { canceled, filePath: savePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Configuration File',
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
      defaultPath: 'claude_desktop_config.json'
    });

    if (canceled || !savePath) {
      return null;
    }

    targetPath = savePath;
  }

  try {
    // Create a backup before saving
    if (fsSync.existsSync(targetPath)) {
      await createBackup(targetPath);
    }
    
    // Write the file
    await fs.writeFile(targetPath, content, 'utf-8');
    
    // Save the last saved file in preferences
    await savePreferences({ lastOpenedFile: targetPath });
    
    return targetPath;
  } catch (err) {
    console.error('Error saving file:', err);
    throw new Error(`Failed to save file: ${err}`);
  }
});

// Handle getting default config path
ipcMain.handle('get-default-config-path', async () => {
  return DEFAULT_CONFIG_PATH;
});

// Handle loading settings
ipcMain.handle('load-settings', async () => {
  return await loadSettings();
});

// Handle saving settings
ipcMain.handle('save-settings', async (_, settings) => {
  return await saveSettings(settings);
});

// Handle browsing for config path
ipcMain.handle('browse-config-path', async () => {
  if (!mainWindow) return null;

  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Configuration File',
    filters: [{ name: 'JSON Files', extensions: ['json'] }],
    properties: ['openFile']
  });

  if (canceled || filePaths.length === 0) {
    return null;
  }

  return filePaths[0];
});

// Handle browsing for backup path
ipcMain.handle('browse-backup-path', async () => {
  if (!mainWindow) return null;

  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Backup Directory',
    properties: ['openDirectory']
  });

  if (canceled || filePaths.length === 0) {
    return null;
  }

  return filePaths[0];
});

// Handle browsing for Claude path
ipcMain.handle('browse-claude-path', async () => {
  if (!mainWindow) return null;

  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Claude Desktop Executable',
    properties: ['openFile'],
    filters: [
      { name: 'Executables', extensions: ['exe'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (canceled || filePaths.length === 0) {
    return null;
  }

  return filePaths[0];
});

// Handle creating a backup
ipcMain.handle('create-backup', async (_, filePath) => {
  return await createBackup(filePath);
});

// Handle restarting Claude
ipcMain.handle('restart-claude', async () => {
  try {
    const settings = await loadSettings();
    let claudePath = settings.claudePath;
    
    // If no path is specified, try to find Claude automatically
    if (!claudePath) {
      // Default paths based on OS
      if (process.platform === 'win32') {
        // Windows: Check common installation locations
        const possiblePaths = [
          path.join(app.getPath('appData'), '..', 'Local', 'AnthropicClaude', 'Claude.exe'),
          path.join(app.getPath('appData'), '..', 'Local', 'Programs', 'Claude', 'Claude.exe'),
          path.join('C:', 'Program Files', 'Claude', 'Claude.exe'),
          path.join('C:', 'Program Files (x86)', 'Claude', 'Claude.exe')
        ];
        
        for (const p of possiblePaths) {
          console.log('Checking Claude path:', p);
          if (fsSync.existsSync(p)) {
            console.log('Found Claude at:', p);
            claudePath = p;
            break;
          }
        }
      } else if (process.platform === 'darwin') {
        // macOS: Check Applications folder
        const macPath = '/Applications/Claude.app/Contents/MacOS/Claude';
        if (fsSync.existsSync(macPath)) {
          claudePath = macPath;
        }
      }
    }
    
    if (!claudePath || !fsSync.existsSync(claudePath)) {
      throw new Error('Claude executable not found. Please specify the path in settings.');
    }
    
    // Kill any running Claude processes
    if (process.platform === 'win32') {
      exec('taskkill /f /im Claude.exe', (error) => {
        if (error) {
          console.log('No Claude process was running or could not be killed');
        } else {
          console.log('Claude process was terminated');
        }
        
        // Start Claude after a short delay
        setTimeout(() => {
          const claudeProcess = spawn(claudePath, [], {
            detached: true,
            stdio: 'ignore'
          });
          
          claudeProcess.unref();
        }, 1000);
      });
    } else if (process.platform === 'darwin') {
      exec('pkill -f Claude', (error) => {
        if (error) {
          console.log('No Claude process was running or could not be killed');
        } else {
          console.log('Claude process was terminated');
        }
        
        // Start Claude after a short delay
        setTimeout(() => {
          const claudeProcess = spawn('open', ['-a', 'Claude'], {
            detached: true,
            stdio: 'ignore'
          });
          
          claudeProcess.unref();
        }, 1000);
      });
    }
    
    return { success: true, message: 'Claude is restarting...' };
  } catch (err: any) {
    console.error('Error restarting Claude:', err);
    return { success: false, message: err.message };
  }
});

// Function to check if a port is in use
async function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const net = require('net');
    const tester = net.createServer()
      .once('error', () => {
        // Port is in use
        resolve(true);
      })
      .once('listening', () => {
        // Port is free, but we need to close the server
        tester.close(() => {
          resolve(false);
        });
      })
      .listen(port, '127.0.0.1');
  });
}

// Function to wait until a port is in use (server is listening)
async function waitForPort(port: number, timeout: number = 10000): Promise<boolean> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const inUse = await isPortInUse(port);
    if (inUse) {
      return true;
    }
    // Wait a bit before checking again
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  return false;
}

// Handle launching an inspector
ipcMain.handle('launch-inspector', async (_, { serverName, serverConfig }) => {
  try {
    // Check if inspector is already running for this server
    if (inspectorProcesses[serverName]) {
      return { 
        success: true, 
        url: inspectorProcesses[serverName].url,
        serverName 
      };
    }
    
    // For Chrome DevTools Protocol, use a random port to avoid conflicts
    // Generate a random port between 10000-60000
    const cdpPort = Math.floor(Math.random() * 50000) + 10000;
    
    // For the web interface, use a different port
    const webPort = 9810;
    
    // Create URLs for both the Chrome DevTools Protocol and the web interface
    const cdpUrl = `chrome-devtools://devtools/bundled/js_app.html?experiments=true&v8only=true&ws=localhost:${cdpPort}/`;
    const webUrl = `http://localhost:${webPort}`;
    
    // We'll try both URLs, but prefer the web interface if it's available
    let primaryUrl = webUrl;
    
    console.log(`[Inspector] Launching inspector for ${serverName}`);
    console.log(`[Inspector] CDP URL: ${cdpUrl}`);
    console.log(`[Inspector] Web URL: ${webUrl}`);
    
    // Prepare environment variables
    const env = {
      ...process.env,
      ...serverConfig.env,
      // Set various environment variables that might be used by the server
      MCP_INSPECTOR_PORT: webPort.toString(),
      PORT: webPort.toString(),
      INSPECTOR_PORT: webPort.toString(),
      NODE_OPTIONS: `--inspect=${cdpPort}` // This will make Node.js listen on the CDP port
    };
    
    // Prepare arguments
    const inspectorArgs = [...serverConfig.args];
    
    // Add --inspect flag if not already present (some servers might use this directly)
    if (!inspectorArgs.includes('--inspect')) {
      inspectorArgs.push('--inspect');
    }
    
    // Add port argument if not already specified
    if (!inspectorArgs.some(arg => arg.includes('--port'))) {
      inspectorArgs.push(`--port=${webPort}`);
    }
    
    console.log(`[Inspector] Launching with command: ${serverConfig.command} ${inspectorArgs.join(' ')}`);
    console.log(`[Inspector] Environment: NODE_OPTIONS=${env.NODE_OPTIONS}`);
    
    // Launch the inspector process
    const inspectorProcess = spawn(serverConfig.command, inspectorArgs, {
      env,
      stdio: 'pipe'
    });
    
    // Store the process with both URLs
    inspectorProcesses[serverName] = {
      process: inspectorProcess,
      url: primaryUrl
    };
    
    // Handle process exit
    inspectorProcess.on('exit', (code) => {
      console.log(`Inspector for ${serverName} exited with code ${code}`);
      delete inspectorProcesses[serverName];
      
      // Notify renderer process
      if (mainWindow) {
        mainWindow.webContents.send('inspector-stopped', { serverName, code });
      }
    });
    
    // Log stdout and stderr
    inspectorProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(`[${serverName}] ${output}`);
      
      // Check if the output contains a URL (some servers output their URL)
      const urlMatch = output.match(/(https?:\/\/[^\s]+)/);
      if (urlMatch && urlMatch[1]) {
        // Update the URL if found in the output
        inspectorProcesses[serverName].url = urlMatch[1];
        console.log(`[Inspector] Found URL in output: ${urlMatch[1]}`);
        primaryUrl = urlMatch[1];
      }
      
      // Check for Debugger listening message
      if (output.includes('Debugger listening on')) {
        const debuggerMatch = output.match(/Debugger listening on (ws:\/\/[^\s]+)/);
        if (debuggerMatch && debuggerMatch[1]) {
          const wsUrl = debuggerMatch[1];
          console.log(`[Inspector] Found debugger WebSocket URL: ${wsUrl}`);
          // Extract the port from the WebSocket URL
          const wsPortMatch = wsUrl.match(/:(\d+)\//);
          if (wsPortMatch && wsPortMatch[1]) {
            const wsPort = wsPortMatch[1];
            // Update the Chrome DevTools URL with the actual port
            const newCdpUrl = `chrome-devtools://devtools/bundled/js_app.html?experiments=true&v8only=true&ws=localhost:${wsPort}/`;
            console.log(`[Inspector] Updated CDP URL: ${newCdpUrl}`);
            // If we haven't found a web URL yet, use the CDP URL
            if (primaryUrl === webUrl) {
              primaryUrl = newCdpUrl;
              inspectorProcesses[serverName].url = primaryUrl;
            }
          }
        }
      }
    });
    
    inspectorProcess.stderr.on('data', (data) => {
      const output = data.toString();
      console.error(`[${serverName}] ${output}`);
      
      // Also check stderr for debugger messages
      if (output.includes('Debugger listening on')) {
        const debuggerMatch = output.match(/Debugger listening on (ws:\/\/[^\s]+)/);
        if (debuggerMatch && debuggerMatch[1]) {
          const wsUrl = debuggerMatch[1];
          console.log(`[Inspector] Found debugger WebSocket URL in stderr: ${wsUrl}`);
          // Extract the port from the WebSocket URL
          const wsPortMatch = wsUrl.match(/:(\d+)\//);
          if (wsPortMatch && wsPortMatch[1]) {
            const wsPort = wsPortMatch[1];
            // Update the Chrome DevTools URL with the actual port
            const newCdpUrl = `chrome-devtools://devtools/bundled/js_app.html?experiments=true&v8only=true&ws=localhost:${wsPort}/`;
            console.log(`[Inspector] Updated CDP URL: ${newCdpUrl}`);
            // If we haven't found a web URL yet, use the CDP URL
            if (primaryUrl === webUrl) {
              primaryUrl = newCdpUrl;
              inspectorProcesses[serverName].url = primaryUrl;
            }
          }
        }
      }
    });
    
    // Wait a bit for the server to start and for us to capture any URLs from the output
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Update the URL in case it was changed by the output parsing
    inspectorProcesses[serverName].url = primaryUrl;
    
    return { success: true, url: primaryUrl, serverName };
  } catch (err: any) {
    console.error('Error launching inspector:', err);
    return { success: false, error: err.message, serverName };
  }
});

// Handle stopping an inspector
ipcMain.handle('stop-inspector', async (_, { serverName }) => {
  try {
    const inspector = inspectorProcesses[serverName];
    if (!inspector) {
      return { success: false, error: 'Inspector not running', serverName };
    }
    
    // Kill the process
    inspector.process.kill();
    delete inspectorProcesses[serverName];
    
    return { success: true, serverName };
  } catch (err: any) {
    console.error('Error stopping inspector:', err);
    return { success: false, error: err.message, serverName };
  }
});

// Handle getting inspector status
ipcMain.handle('get-inspector-status', async () => {
  return Object.entries(inspectorProcesses).map(([serverName, { url }]) => ({
    serverName,
    url,
    running: true
  }));
});

// Handle opening inspector URL
ipcMain.handle('open-inspector-url', async (_, { url }) => {
  try {
    console.log(`[Inspector] Attempting to open URL: ${url}`);
    
    // For Chrome DevTools Protocol URLs, we need to use a different approach
    if (url.startsWith('chrome-devtools://')) {
      console.log(`[Inspector] Opening Chrome DevTools URL: ${url}`);
      
      // On Windows, we can use the start command to open the URL
      if (process.platform === 'win32') {
        const startProcess = spawn('start', [url], { 
          shell: true, 
          detached: true,
          stdio: 'ignore'
        });
        startProcess.unref();
      } else {
        // On macOS and Linux, we can use the open command
        const openProcess = spawn('open', [url], {
          detached: true,
          stdio: 'ignore'
        });
        openProcess.unref();
      }
      
      return { success: true };
    }
    
    // For regular HTTP URLs, we can use shell.openExternal
    console.log(`[Inspector] Opening external URL: ${url}`);
    await shell.openExternal(url);
    
    return { success: true };
  } catch (err) {
    console.error('Error opening URL:', err);
    return { success: false };
  }
});

// Send preferences to renderer when main window is ready
app.on('ready', async () => {
  const prefs = await loadPreferences();
  
  // Wait for the main window to be ready
  app.on('browser-window-created', (_, window) => {
    window.webContents.on('did-finish-load', () => {
      window.webContents.send('load-preferences', prefs);
    });
  });
});
