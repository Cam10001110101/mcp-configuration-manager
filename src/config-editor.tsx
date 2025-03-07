import React, { useState, useCallback, useEffect } from 'react';
import ProfileManager from './components/ProfileManager.tsx';
import SettingsModal from './components/SettingsModal.tsx';
import RawConfigModal from './components/RawConfigModal.tsx';

// Inspector status type
interface InspectorStatus {
  serverName: string;
  url: string;
  running: boolean;
}

interface McpServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

interface McpConfig {
  mcpServers: Record<string, McpServerConfig>;
}

interface Component {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

interface Config {
  components: Component[];
}

const ConfigEditor: React.FC = () => {
  const [config, setConfig] = useState<Config>({ components: [] });
  const [message, setMessage] = useState<string>('');
  const [inspectorStatus, setInspectorStatus] = useState<InspectorStatus[]>([]);
  const [showInspectorModal, setShowInspectorModal] = useState<boolean>(false);
  const [selectedInspector, setSelectedInspector] = useState<InspectorStatus | null>(null);
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  const [isElectronAvailable, setIsElectronAvailable] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [showRawConfig, setShowRawConfig] = useState<boolean>(false);
  const [rawConfigText, setRawConfigText] = useState<string>('');
  const [configPath, setConfigPath] = useState<string>('');
  const [backupPath, setBackupPath] = useState<string>('');
  const [claudePath, setClaudePath] = useState<string>('');
  const [defaultConfigPath, setDefaultConfigPath] = useState<string>('');
  const [defaultBackupPath, setDefaultBackupPath] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [filterText, setFilterText] = useState<string>('');
  const [searchText, setSearchText] = useState<string>('');
  const [editingServerIndex, setEditingServerIndex] = useState<number | null>(null);
  const [tempServer, setTempServer] = useState<Component | null>(null);
  const [showEditModal, setShowEditModal] = useState<boolean>(false);

  // Load configuration from profile (used when switching profiles)
  const handleProfileSwitch = useCallback(async () => {
    if (!isElectronAvailable) {
      setMessage('❌ Cannot load profile: Electron API not available');
      return;
    }

    try {
      console.log('Loading profile configuration...');
      
      // Load settings to get the current config path
      const settings = await window.electron.loadSettings();
      console.log('Settings loaded:', settings);
      
      if (!settings || !settings.configPath) {
        throw new Error('No configuration path found in settings');
      }

      // Update the settings state variables
      setConfigPath(settings.configPath);
      if (settings.backupPath) {
        setBackupPath(settings.backupPath);
      }
      if (settings.claudePath) {
        setClaudePath(settings.claudePath);
      }

      // Load the configuration file
      console.log('Loading configuration from path:', settings.configPath);
      const result = await window.electron.loadConfigByPath(settings.configPath);
      
      if (!result) {
        throw new Error('Failed to load configuration file');
      }

      console.log('Configuration loaded:', result);
      const { filePath, content } = result;
      
      // Update the current file path to ensure it matches the active profile
      setCurrentFilePath(filePath);
      
      // Try to parse the content as JSON to see if it's valid
      try {
        const jsonContent = JSON.parse(content);
        console.log('JSON parsed successfully:', jsonContent);
        
        if (!jsonContent.mcpServers) {
          console.warn('Warning: mcpServers object not found in configuration');
          // Create an empty mcpServers object if it doesn't exist
          jsonContent.mcpServers = {};
          // Use the modified content
          await loadConfigFromContent(JSON.stringify(jsonContent), filePath);
        } else {
          await loadConfigFromContent(content, filePath);
        }
      } catch (jsonError) {
        console.error('Error parsing JSON:', jsonError);
        // If the content is not valid JSON, create a new empty configuration
        const emptyConfig = JSON.stringify({ mcpServers: {} });
        await loadConfigFromContent(emptyConfig, filePath);
      }
      
      setMessage(`✓ Loaded configuration successfully`);
    } catch (err: any) {
      console.error('Error loading profile configuration:', err);
      setMessage(`❌ Error loading configuration: ${err.message}`);
      
      // If there's an error, try to load an empty configuration
      try {
        setConfig({ components: [] });
        setMessage(`✓ Created empty configuration`);
      } catch (fallbackErr) {
        console.error('Error creating empty configuration:', fallbackErr);
      }
    }
  }, [isElectronAvailable]);

  // Check if Electron APIs are available and load settings
  useEffect(() => {
    const electronAvailable = !!(window.electron && 
                               typeof window.electron.loadConfig === 'function' && 
                               typeof window.electron.saveConfig === 'function');
    setIsElectronAvailable(electronAvailable);

    if (!electronAvailable) {
      console.warn('Electron API not available. Running in browser mode with limited functionality.');
      setMessage('⚠️ Running in browser mode with limited functionality. Some features may not work.');
      return;
    }

    loadSettings();
  }, []);

  // Load configuration on startup
  useEffect(() => {
    if (isElectronAvailable) {
      // Load the configuration after a short delay to ensure settings are loaded
      const timer = setTimeout(() => {
        handleProfileSwitch();
        
        // Auto-show the raw config after loading for testing
        setTimeout(() => {
          console.log('Auto-showing raw config for testing');
          handleShowRawConfig();
        }, 2000);
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [isElectronAvailable, handleProfileSwitch]);

  const loadSettings = async () => {
    if (!isElectronAvailable) return;

    try {
      if (window.electron.getDefaultConfigPath) {
        const defaultPath = await window.electron.getDefaultConfigPath();
        setDefaultConfigPath(defaultPath);
      }
      
      const defaultBackupDir = 'config-backups';
      setDefaultBackupPath(defaultBackupDir);
      setBackupPath(defaultBackupDir);
      
      if (window.electron.loadSettings) {
        const settings = await window.electron.loadSettings();
        if (settings) {
          if (settings.configPath) {
            setConfigPath(settings.configPath);
          } else {
            setConfigPath(defaultConfigPath);
          }
          
          if (settings.backupPath) {
            setBackupPath(settings.backupPath);
          }
          if (settings.claudePath) {
            setClaudePath(settings.claudePath);
          }
        }
      }
    } catch (err) {
      console.error('Error loading settings:', err);
    }
  };

  // Load configuration from a file dialog
  const handleLoadClick = useCallback(async () => {
    if (!isElectronAvailable) {
      setMessage('❌ Cannot load file: Electron API not available');
      return;
    }

    try {
      const result = await window.electron.loadConfig();
      if (!result) {
        console.log('No file selected');
        return;
      }

      const { filePath, content } = result;
      console.log('Selected file:', filePath);
      
      await loadConfigFromContent(content, filePath);
    } catch (err: any) {
      console.error('Error loading file:', err);
      setMessage(`❌ Error loading configuration file: ${err.message}`);
    }
  }, [isElectronAvailable]);

  // Common function to parse and load configuration content
  const loadConfigFromContent = async (content: string, filePath: string) => {
    let jsonConfig: any;
    try {
      jsonConfig = JSON.parse(content);
      console.log('Parsed JSON config:', jsonConfig);
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      throw new Error('Invalid JSON format');
    }

    if (!jsonConfig || typeof jsonConfig !== 'object') {
      console.error('Invalid config structure:', jsonConfig);
      throw new Error('Invalid config structure');
    }

    if (!jsonConfig.mcpServers || typeof jsonConfig.mcpServers !== 'object') {
      console.error('Missing mcpServers object:', jsonConfig);
      // Create an empty mcpServers object if it doesn't exist
      jsonConfig.mcpServers = {};
    }
    
    // Ensure mcpServers is not null or undefined
    const mcpServers = jsonConfig.mcpServers || {};
    console.log('mcpServers:', mcpServers);
    
    // Convert the mcpServers object to an array of components
    const components = Object.entries(mcpServers).map(([name, config]: [string, any]) => {
      // Ensure config has the required properties
      const safeConfig = config || {};
      return {
        name,
        command: safeConfig.command || '',
        args: Array.isArray(safeConfig.args) ? safeConfig.args : [],
        env: safeConfig.env || {}
      };
    });
    
    console.log('Converted components:', components);
    
    // Update the state with the new components
    setConfig({ components });
    setCurrentFilePath(filePath);
    
    // Save the message based on the number of components
    const message = `✓ Loaded ${components.length} server configuration${components.length === 1 ? '' : 's'} successfully`;
    console.log(message);
    setMessage(message);
  };

  const handleShowRawConfig = async () => {
    try {
      let configToShow = '';
      
      // If we have a current file path, try to load the config directly from the file
      if (currentFilePath && isElectronAvailable) {
        console.log('Loading config from file for raw display:', currentFilePath);
        const result = await window.electron.loadConfigByPath(currentFilePath);
        if (result && result.content && result.content.trim()) {
          console.log('Loaded config from file for raw display:', result.content);
          configToShow = result.content;
        }
      }
      
      // If we couldn't load from file or it was empty, generate from components
      if (!configToShow) {
        configToShow = generateRawConfigText();
        console.log('Generated config from components:', configToShow);
      }
      
      // Set the config text and show the modal
      console.log('Setting raw config text to:', configToShow);
      setRawConfigText(configToShow);
      setShowRawConfig(true);
    } catch (err) {
      console.error('Error preparing raw config:', err);
      // Ensure we have a fallback config
      const fallbackConfig = generateRawConfigText();
      console.log('Using fallback config due to error:', fallbackConfig);
      setRawConfigText(fallbackConfig);
      setShowRawConfig(true);
    }
  };

  const generateRawConfigText = () => {
    const mcpServers = config.components.reduce((acc, component) => {
      acc[component.name] = {
        command: component.command,
        args: component.args.filter(arg => arg.length > 0),
        ...(component.env && Object.keys(component.env).length > 0 ? { env: component.env } : {})
      };
      return acc;
    }, {} as Record<string, McpServerConfig>);

    return JSON.stringify({ mcpServers }, null, 2);
  };

  const handleAddServer = () => {
    setTempServer({ 
      name: `server${config.components.length + 1}`,
      command: '',
      args: [''],
      env: {}
    });
    setEditingServerIndex(-1);
  };

  const toggleEditServer = (index: number) => {
    if (editingServerIndex === index) {
      // If clicking the same server again, close the edit modal
      setEditingServerIndex(null);
      setShowEditModal(false);
      setTempServer(null);
    } else {
      // Set up the temp server with the current values
      const component = config.components[index];
      setTempServer({...component});
      setEditingServerIndex(index);
      setShowEditModal(true);
    }
  };

  const handleLaunchInspector = async (serverName: string, serverConfig: McpServerConfig) => {
    if (!isElectronAvailable) {
      setMessage('❌ Cannot launch inspector: Electron API not available');
      return;
    }

    try {
      console.log(`Launching inspector for ${serverName} with config:`, serverConfig);
      setMessage(`Launching inspector for ${serverName}...`);
      
      const result = await window.electron.launchInspector(serverName, serverConfig);
      
      if (result.success && result.url) {
        setInspectorStatus(prev => {
          const filtered = prev.filter(status => status.serverName !== serverName);
          return [...filtered, { serverName, url: result.url!, running: true }];
        });
        
        setMessage(`✓ Inspector for ${serverName} launched successfully`);
        
        const newStatus = { serverName, url: result.url, running: true };
        setSelectedInspector(newStatus);
        setShowInspectorModal(true);
        
        // Open the inspector URL in a browser window
        try {
          console.log(`Opening inspector URL: ${result.url}`);
          const openResult = await window.electron.openInspectorUrl(result.url);
          console.log(`Open URL result:`, openResult);
          
          if (!openResult.success) {
            console.warn(`Failed to open URL automatically, showing modal for manual opening`);
          }
        } catch (openErr) {
          console.error(`Error opening inspector URL:`, openErr);
          // Continue even if opening the URL fails, as the user can still open it from the modal
        }
      } else {
        throw new Error(result.error || 'Unknown error');
      }
    } catch (err: any) {
      console.error('Error launching inspector:', err);
      setMessage(`❌ Error launching inspector: ${err.message}`);
    }
  };

  return (
    <div className="flex h-screen bg-[#1a1a1a] text-gray-100">
      {/* Profile Manager Sidebar */}
      <ProfileManager 
        onMessage={setMessage} 
        onProfileSwitch={handleProfileSwitch}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => {
          setShowSettings(false);
          // Reload settings and configuration after closing the settings modal
          loadSettings().then(() => {
            handleProfileSwitch();
          });
        }}
        onMessage={setMessage}
        initialSettings={{
          configPath,
          backupPath,
          claudePath
        }}
      />

      {/* Server Edit Modal */}
      {showEditModal && tempServer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-[#222222] p-6 rounded-lg w-full max-w-2xl">
            <h2 className="text-xl font-bold mb-4">Edit Server: {tempServer.name}</h2>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-1">Server Name</label>
              <input
                type="text"
                value={tempServer.name}
                onChange={(e) => setTempServer({...tempServer, name: e.target.value})}
                className="w-full p-2 bg-gray-700 text-white border border-gray-600 rounded"
              />
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-1">Command</label>
              <input
                type="text"
                value={tempServer.command}
                onChange={(e) => setTempServer({...tempServer, command: e.target.value})}
                className="w-full p-2 bg-gray-700 text-white border border-gray-600 rounded"
              />
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-1">Arguments</label>
              {tempServer.args.map((arg, index) => (
                <div key={index} className="flex mb-2">
                  <input
                    type="text"
                    value={arg}
                    onChange={(e) => {
                      const newArgs = [...tempServer.args];
                      newArgs[index] = e.target.value;
                      setTempServer({...tempServer, args: newArgs});
                    }}
                    className="flex-grow p-2 bg-gray-700 text-white border border-gray-600 rounded-l"
                  />
                  <button
                    onClick={() => {
                      const newArgs = tempServer.args.filter((_, i) => i !== index);
                      setTempServer({...tempServer, args: newArgs});
                    }}
                    className="px-3 bg-red-700 text-white rounded-r hover:bg-red-600"
                  >
                    -
                  </button>
                </div>
              ))}
              <button
                onClick={() => {
                  setTempServer({...tempServer, args: [...tempServer.args, '']});
                }}
                className="mt-2 px-3 py-1 bg-blue-700 text-white rounded hover:bg-blue-600"
              >
                + Add Argument
              </button>
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-1">Environment Variables</label>
              {Object.entries(tempServer.env || {}).map(([key, value], index) => (
                <div key={index} className="flex mb-2">
                  <input
                    type="text"
                    value={key}
                    onChange={(e) => {
                      const newEnv = {...tempServer.env};
                      const oldValue = newEnv[key];
                      delete newEnv[key];
                      newEnv[e.target.value] = oldValue;
                      setTempServer({...tempServer, env: newEnv});
                    }}
                    className="w-1/3 p-2 bg-gray-700 text-white border border-gray-600 rounded-l"
                    placeholder="Key"
                  />
                  <input
                    type="text"
                    value={value as string}
                    onChange={(e) => {
                      const newEnv = {...tempServer.env};
                      newEnv[key] = e.target.value;
                      setTempServer({...tempServer, env: newEnv});
                    }}
                    className="flex-grow p-2 bg-gray-700 text-white border-l-0 border-r-0 border-gray-600"
                    placeholder="Value"
                  />
                  <button
                    onClick={() => {
                      const newEnv = {...tempServer.env};
                      delete newEnv[key];
                      setTempServer({...tempServer, env: newEnv});
                    }}
                    className="px-3 bg-red-700 text-white rounded-r hover:bg-red-600"
                  >
                    -
                  </button>
                </div>
              ))}
              <button
                onClick={() => {
                  const newEnv = {...tempServer.env};
                  newEnv[`ENV_VAR_${Object.keys(newEnv).length}`] = '';
                  setTempServer({...tempServer, env: newEnv});
                }}
                className="mt-2 px-3 py-1 bg-blue-700 text-white rounded hover:bg-blue-600"
              >
                + Add Environment Variable
              </button>
            </div>
            
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingServerIndex(null);
                  setTempServer(null);
                }}
                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-500"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  // Save the changes
                  const newComponents = [...config.components];
                  
                  if (editingServerIndex === -1) {
                    // Adding a new server
                    newComponents.push(tempServer);
                  } else {
                    // Editing an existing server
                    newComponents[editingServerIndex] = tempServer;
                  }
                  
                  setConfig({components: newComponents});
                  setShowEditModal(false);
                  setEditingServerIndex(null);
                  setTempServer(null);
                  
                  // Generate and save the raw config
                  const rawConfig = JSON.stringify({
                    mcpServers: newComponents.reduce((acc, component) => {
                      acc[component.name] = {
                        command: component.command,
                        args: component.args.filter(arg => arg.length > 0),
                        ...(component.env && Object.keys(component.env).length > 0 ? { env: component.env } : {})
                      };
                      return acc;
                    }, {} as Record<string, McpServerConfig>)
                  }, null, 2);
                  
                  // Save to file if we have a path
                  if (currentFilePath && isElectronAvailable) {
                    window.electron.saveConfig(rawConfig, currentFilePath)
                      .then(() => {
                        setMessage(`✓ Server configuration saved successfully`);
                      })
                      .catch((err) => {
                        console.error('Error saving configuration:', err);
                        setMessage(`❌ Error saving configuration: ${err.message}`);
                      });
                  }
                }}
                className="px-4 py-2 bg-blue-700 text-white rounded hover:bg-blue-600"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inspector Modal */}
      {showInspectorModal && selectedInspector && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-[#222222] p-6 rounded-lg w-full max-w-2xl">
            <h2 className="text-xl font-bold mb-4">Inspector: {selectedInspector.serverName}</h2>
            
            <div className="mb-6">
              {selectedInspector.url.startsWith('chrome-devtools://') ? (
                <div>
                  <p className="text-yellow-300 mb-2">⚠️ This is a Chrome DevTools URL that can only be opened in Chrome/Edge</p>
                  <p className="text-gray-300 mb-2">To use this inspector:</p>
                  <ol className="list-decimal list-inside text-gray-300 mb-4 pl-4">
                    <li className="mb-1">Copy this URL: <code className="bg-gray-700 px-2 py-1 rounded">{selectedInspector.url}</code></li>
                    <li className="mb-1">Open Chrome or Edge browser</li>
                    <li className="mb-1">Paste the URL in the address bar</li>
                  </ol>
                  <div className="flex mb-4">
                    <button
                      onClick={() => {
                        // Copy URL to clipboard
                        navigator.clipboard.writeText(selectedInspector.url)
                          .then(() => {
                            setMessage("✓ URL copied to clipboard");
                          })
                          .catch(err => {
                            console.error("Failed to copy URL: ", err);
                            setMessage("❌ Failed to copy URL");
                          });
                      }}
                      className="px-3 py-1 bg-blue-700 text-white rounded hover:bg-blue-600 mr-3"
                    >
                      Copy URL
                    </button>
                    <button
                      onClick={() => {
                        window.electron.openInspectorUrl(selectedInspector.url);
                      }}
                      className="px-3 py-1 bg-blue-700 text-white rounded hover:bg-blue-600"
                    >
                      Try to Open in Chrome
                    </button>
                  </div>
                  <p className="text-gray-400 text-sm">Note: The Node.js debugger is running on port 9229. This is not a web server you can access in a browser by typing localhost:9229.</p>
                </div>
              ) : (
                <div>
                  <p className="text-gray-300 mb-2">Inspector URL: <a href="#" onClick={(e) => {
                    e.preventDefault();
                    window.electron.openInspectorUrl(selectedInspector.url);
                  }} className="text-blue-400 hover:underline">{selectedInspector.url}</a></p>
                  <button
                    onClick={() => {
                      window.electron.openInspectorUrl(selectedInspector.url);
                    }}
                    className="px-3 py-1 bg-blue-700 text-white rounded hover:bg-blue-600"
                  >
                    Open in Browser
                  </button>
                </div>
              )}
            </div>
            
            <div className="flex justify-end space-x-3 border-t border-gray-700 pt-4">
              <button
                onClick={() => {
                  setShowInspectorModal(false);
                  setSelectedInspector(null);
                }}
                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-500"
              >
                Close
              </button>
              <button
                onClick={() => {
                  window.electron.stopInspector(selectedInspector.serverName)
                    .then((result) => {
                      if (result.success) {
                        setInspectorStatus(prev => prev.filter(status => status.serverName !== selectedInspector.serverName));
                        setShowInspectorModal(false);
                        setSelectedInspector(null);
                        setMessage(`✓ Inspector for ${selectedInspector.serverName} stopped successfully`);
                      } else {
                        throw new Error(result.error || 'Unknown error');
                      }
                    })
                    .catch((err) => {
                      console.error('Error stopping inspector:', err);
                      setMessage(`❌ Error stopping inspector: ${err.message}`);
                    });
                }}
                className="px-4 py-2 bg-red-700 text-white rounded hover:bg-red-600"
              >
                Stop Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Raw Config Modal */}
      <RawConfigModal
        isOpen={showRawConfig}
        onClose={() => setShowRawConfig(false)}
        onMessage={setMessage}
        initialConfig={rawConfigText}
        onSave={async (configText) => {
          try {
            if (!isElectronAvailable) {
              throw new Error('Electron API not available');
            }
            
            if (!currentFilePath) {
              throw new Error('No file path specified');
            }
            
            // Save to file
            await window.electron.saveConfig(configText, currentFilePath);
            
            // Also save to the current profile in the database
            try {
              // Get all profiles to find the current one
              const profiles = await window.electron.getAllProfiles();
              
              // Find the profile that matches the current config path
              const currentProfile = profiles.find(p => p.config_path === configPath);
              
              if (currentProfile) {
                console.log('Saving configuration to profile:', currentProfile.id);
                // Save the configuration to the profile in the database
                await window.electron.saveProfile(currentProfile.id, configText);
                console.log('Configuration saved to profile successfully');
              } else {
                console.warn('Could not find current profile for path:', configPath);
              }
            } catch (profileErr) {
              console.error('Error saving to profile:', profileErr);
              // Continue even if saving to profile fails
            }
            
            // Reload the configuration
            await loadConfigFromContent(configText, currentFilePath);
            
          } catch (err: any) {
            console.error('Error saving configuration:', err);
            throw err;
          }
        }}
      />

      {/* Main Content */}
      <div className="flex-1 p-6 overflow-auto">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold">MCP Mason</h1>
          <div className="space-x-6 flex items-center">
            <button
              onClick={handleShowRawConfig}
              className="text-gray-100 hover:text-white hover:underline flex items-center"
              title="View and edit raw JSON configuration"
              aria-label="Show raw configuration"
              disabled={!isElectronAvailable && !currentFilePath && config.components.length === 0}
            >
              <span className="mr-1">📝</span> Show Config
            </button>
            <button
              onClick={async () => {
                if (!isElectronAvailable) {
                  setMessage('❌ Cannot backup: Electron API not available');
                  return;
                }
                
                if (!currentFilePath) {
                  setMessage('❌ Cannot backup: No file is currently loaded');
                  return;
                }
                
                try {
                  // Ensure we're using the current config path from settings
                  const settings = await window.electron.loadSettings();
                  const pathToBackup = settings && settings.configPath ? settings.configPath : currentFilePath;
                  
                  const result = await window.electron.createBackup(pathToBackup);
                  if (result.success) {
                    setMessage(`✓ Backup created successfully at ${result.backupFilePath}`);
                  } else {
                    throw new Error('Backup failed');
                  }
                } catch (err: any) {
                  console.error('Error creating backup:', err);
                  setMessage(`❌ Error creating backup: ${err.message}`);
                }
              }}
              className="text-gray-100 hover:text-white hover:underline flex items-center"
              title="Create a backup of the current configuration"
              aria-label="Backup configuration"
              disabled={!isElectronAvailable || !currentFilePath}
            >
              <span className="mr-1">📦</span> Backup Config
            </button>
            <button
              onClick={async () => {
                if (!isElectronAvailable) {
                  setMessage('❌ Cannot restart MCP Client: Electron API not available');
                  return;
                }
                
                // Confirm with the user before restarting MCP Client
                if (!window.confirm('This will close all running MCP Client instances and restart the application. Continue?')) {
                  return;
                }
                
                try {
                  setMessage('Restarting MCP Client...');
                  const result = await window.electron.restartClaude();
                  if (result.success) {
                    setMessage(`✓ ${result.message}`);
                  } else {
                    throw new Error(result.message);
                  }
                } catch (err: any) {
                  console.error('Error restarting MCP Client:', err);
                  setMessage(`❌ Error restarting MCP Client: ${err.message}`);
                }
              }}
              className="text-gray-100 hover:text-white hover:underline flex items-center"
              title="Restart MCP Client to apply configuration changes"
              aria-label="Restart MCP Client"
              disabled={!isElectronAvailable}
            >
              <span className="mr-1">🔄</span> Restart Client
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="text-gray-100 hover:text-white hover:underline cursor-pointer flex items-center"
              title="Open settings"
              aria-label="Open settings"
              disabled={!isElectronAvailable}
            >
              <span className="mr-1">⚙️</span> Settings
            </button>
          </div>
        </div>

        {message && (
          <div className="mb-4 p-3 bg-green-900 text-green-100 border border-green-600 rounded">
            {message}
          </div>
        )}

        {/* Filter, Search and Sort Controls */}
        <div className="flex justify-between items-center mb-4 bg-[#222222] p-3 rounded">
          <div className="flex items-center space-x-3 flex-grow">
            <div className="flex items-center">
              <span className="text-sm text-gray-300 mr-2">Filter:</span>
              <input
                type="text"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="Filter servers (coming soon)"
                className="p-2 bg-gray-700 text-gray-100 border border-gray-600 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 w-40"
                disabled
              />
            </div>
            
            <div className="flex items-center">
              <span className="text-sm text-gray-300 mr-2">Search:</span>
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Search servers"
                className="p-2 bg-gray-700 text-gray-100 border border-gray-600 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 w-40"
              />
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-300">Sort:</span>
            <button
              onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
              className="flex items-center space-x-1 px-3 py-1 bg-gray-700 text-gray-100 rounded hover:bg-gray-600"
              title={`Sort by name ${sortDirection === 'asc' ? 'descending' : 'ascending'}`}
            >
              <span>Name</span>
              <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
            </button>
          </div>
        </div>

        {/* Server Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 text-sm">
          {/* Add Server Button */}
          <button 
            onClick={handleAddServer}
            className="p-3 bg-[#222222] rounded-lg hover:bg-[#2a2a2a] border-2 border-dashed border-gray-700 h-[140px] flex flex-col"
          >
            <div className="flex justify-center mb-2">
              <div className="w-12 h-12 bg-[#3b82f6] rounded-full flex items-center justify-center">
                <span className="text-xl font-bold">+</span>
              </div>
            </div>
            
            <div className="text-center mb-2">
              <h3 className="text-sm font-semibold">Add Server</h3>
              <p className="text-xs text-gray-400">Create a new MCP server configuration</p>
            </div>
          </button>
          
          {/* Server Cards */}
          {[...config.components]
            .filter(component => {
              if (searchText.trim() === '') return true;
              
              const searchLower = searchText.toLowerCase();
              return (
                component.name.toLowerCase().includes(searchLower) ||
                component.command.toLowerCase().includes(searchLower) ||
                component.args.some(arg => arg.toLowerCase().includes(searchLower))
              );
            })
            .sort((a, b) => {
              if (sortDirection === 'asc') {
                return a.name.localeCompare(b.name);
              } else {
                return b.name.localeCompare(a.name);
              }
            })
            .map((component, serverIndex) => (
              <div key={serverIndex} className="flex flex-col">
                <div className="p-3 bg-[#222222] rounded-lg h-[140px] flex flex-col">
                  <div className="text-center mb-2">
                    <h3 className="text-sm font-semibold truncate">{component.name}</h3>
                  </div>
                  
                  <div className="flex justify-center mb-2">
                    <div className="w-12 h-12 bg-[#3b82f6] rounded-full flex items-center justify-center">
                      <span className="text-xl font-bold">{component.name.charAt(0).toUpperCase()}</span>
                    </div>
                  </div>
                  
                  <div className="mt-auto flex justify-center space-x-4">
                    <button
                      onClick={() => toggleEditServer(serverIndex)}
                      className="text-gray-100 hover:text-white hover:underline text-sm"
                    >
                      Edit
                    </button>
                    
                    {isElectronAvailable && (
                      <>
                        {inspectorStatus.some(status => status.serverName === component.name) ? (
                          <button
                            onClick={() => {
                              const status = inspectorStatus.find(s => s.serverName === component.name);
                              if (status) {
                                setSelectedInspector(status);
                                setShowInspectorModal(true);
                              }
                            }}
                            className="text-gray-100 hover:text-white hover:underline text-sm"
                            title="View running inspector"
                          >
                            Inspect
                          </button>
                        ) : (
                          <button
                            onClick={() => handleLaunchInspector(component.name, {
                              command: component.command,
                              args: component.args.filter(arg => arg.length > 0),
                              env: component.env
                            })}
                            className="text-gray-100 hover:text-white hover:underline text-sm"
                            title="Launch MCP Inspector for this server"
                          >
                            Inspect
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
};

export default ConfigEditor;
