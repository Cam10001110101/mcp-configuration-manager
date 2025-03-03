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
      // If we have a current file path, try to load the config directly from the file
      if (currentFilePath && isElectronAvailable) {
        console.log('Loading config from file for raw display:', currentFilePath);
        const result = await window.electron.loadConfigByPath(currentFilePath);
        if (result && result.content) {
          console.log('Loaded config from file for raw display');
          setRawConfigText(result.content);
        } else {
          // Fallback to generating from components if file load fails
          console.log('Falling back to generated config for raw display');
          setRawConfigText(generateRawConfigText());
        }
      } else {
        // No file path, generate from components
        console.log('Generating config for raw display from components');
        setRawConfigText(generateRawConfigText());
      }
      setShowRawConfig(true);
    } catch (err) {
      console.error('Error preparing raw config:', err);
      // Fallback to generating from components if any error occurs
      setRawConfigText(generateRawConfigText());
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
    setEditingServerIndex(editingServerIndex === index ? null : index);
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
                if (!isElectronAvailable || !currentFilePath) {
                  setMessage('❌ Cannot backup: No file is currently loaded');
                  return;
                }
                
                try {
                  const result = await window.electron.createBackup(currentFilePath);
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
