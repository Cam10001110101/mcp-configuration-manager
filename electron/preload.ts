import { contextBridge, ipcRenderer } from 'electron';

console.log('Preload script starting...');

// Type for Inspector status
interface InspectorStatus {
  serverName: string;
  url: string;
  running: boolean;
}

// Profile types
interface Profile {
  id: number;
  name: string;
  config_path: string;
  backup_path: string;
  mcp_client_path: string | null;
  created_at: string;
  updated_at: string;
}

try {
  // Expose protected methods that allow the renderer process to use
  // the ipcRenderer without exposing the entire object
  contextBridge.exposeInMainWorld(
    'electron',
    {
      loadConfig: async () => {
        console.log('loadConfig called');
        return await ipcRenderer.invoke('load-config');
      },
      loadConfigByPath: async (filePath: string) => {
        console.log('loadConfigByPath called', { filePath });
        return await ipcRenderer.invoke('load-config-by-path', filePath);
      },
      saveConfig: async (content: string, filePath?: string) => {
        console.log('saveConfig called', { filePath });
        return await ipcRenderer.invoke('save-config', { content, filePath });
      },
      onLoadPreferences: (callback: (prefs: { lastOpenedFile: string | null }) => void) => {
        ipcRenderer.on('load-preferences', (_, prefs) => callback(prefs));
      },
      getDefaultConfigPath: async () => {
        console.log('getDefaultConfigPath called');
        return await ipcRenderer.invoke('get-default-config-path');
      },
      loadSettings: async () => {
        console.log('loadSettings called');
        return await ipcRenderer.invoke('load-settings');
      },
      saveSettings: async (settings: { configPath?: string, backupPath?: string, claudePath?: string }) => {
        console.log('saveSettings called', settings);
        return await ipcRenderer.invoke('save-settings', settings);
      },
      browseConfigPath: async () => {
        console.log('browseConfigPath called');
        return await ipcRenderer.invoke('browse-config-path');
      },
      browseBackupPath: async () => {
        console.log('browseBackupPath called');
        return await ipcRenderer.invoke('browse-backup-path');
      },
      browseClaudePath: async () => {
        console.log('browseClaudePath called');
        return await ipcRenderer.invoke('browse-claude-path');
      },
      createBackup: async (filePath: string) => {
        console.log('createBackup called', { filePath });
        return await ipcRenderer.invoke('create-backup', filePath);
      },
      restartClaude: async () => {
        console.log('restartClaude called');
        return await ipcRenderer.invoke('restart-claude');
      },
      // Inspector-related functions
      launchInspector: async (serverName: string, serverConfig: { command: string, args: string[], env?: Record<string, string> }) => {
        console.log('launchInspector called', { serverName, serverConfig });
        return await ipcRenderer.invoke('launch-inspector', { serverName, serverConfig });
      },
      stopInspector: async (serverName: string) => {
        console.log('stopInspector called', { serverName });
        return await ipcRenderer.invoke('stop-inspector', { serverName });
      },
      getInspectorStatus: async () => {
        console.log('getInspectorStatus called');
        return await ipcRenderer.invoke('get-inspector-status');
      },
      openInspectorUrl: async (url: string) => {
        console.log('openInspectorUrl called', { url });
        return await ipcRenderer.invoke('open-inspector-url', { url });
      },
      onInspectorStopped: (callback: (data: { serverName: string, code: number | null }) => void) => {
        ipcRenderer.on('inspector-stopped', (_, data) => callback(data));
      },
      // Profile management functions
      createProfile: async (name: string, configPath: string, backupPath: string, mcpClientPath: string | null) => {
        console.log('createProfile called', { name, configPath, backupPath, mcpClientPath });
        return await ipcRenderer.invoke('create-profile', { name, configPath, backupPath, mcpClientPath });
      },
      getAllProfiles: async () => {
        console.log('getAllProfiles called');
        return await ipcRenderer.invoke('get-all-profiles');
      },
      getProfile: async (id: number) => {
        console.log('getProfile called', { id });
        return await ipcRenderer.invoke('get-profile', id);
      },
      switchProfile: async (id: number) => {
        console.log('switchProfile called', { id });
        return await ipcRenderer.invoke('switch-profile', id);
      },
      saveProfile: async (id: number, content: string) => {
        console.log('saveProfile called', { id });
        return await ipcRenderer.invoke('save-profile', { id, content });
      },
      remixProfile: async (id: number, newName: string) => {
        console.log('remixProfile called', { id, newName });
        return await ipcRenderer.invoke('remix-profile', { id, newName });
      },
      deleteProfile: async (id: number) => {
        console.log('deleteProfile called', { id });
        return await ipcRenderer.invoke('delete-profile', id);
      }
    }
  );
  console.log('APIs exposed successfully');
} catch (err) {
  console.error('Failed to expose APIs:', err);
}

// Add type definitions for the exposed APIs
declare global {
  interface Window {
    electron: {
      loadConfig: () => Promise<{ filePath: string; content: string; } | null>;
      loadConfigByPath: (filePath: string) => Promise<{ filePath: string; content: string; } | null>;
      saveConfig: (content: string, filePath?: string) => Promise<string | null>;
      onLoadPreferences: (callback: (prefs: { lastOpenedFile: string | null }) => void) => void;
      getDefaultConfigPath: () => Promise<string>;
      saveSettings: (settings: { configPath?: string, backupPath?: string, claudePath?: string }) => Promise<boolean>;
      loadSettings: () => Promise<{ configPath: string, backupPath?: string, claudePath?: string } | null>;
      browseConfigPath: () => Promise<string | null>;
      browseBackupPath: () => Promise<string | null>;
      browseClaudePath: () => Promise<string | null>;
      createBackup: (filePath: string) => Promise<{ success: boolean, backupFilePath?: string, error?: any }>;
      restartClaude: () => Promise<{ success: boolean, message: string }>;
      // Inspector-related functions
      launchInspector: (serverName: string, serverConfig: { command: string, args: string[], env?: Record<string, string> }) => 
        Promise<{ success: boolean, url?: string, error?: string, serverName: string }>;
      stopInspector: (serverName: string) => 
        Promise<{ success: boolean, error?: string, serverName: string }>;
      getInspectorStatus: () => Promise<InspectorStatus[]>;
      openInspectorUrl: (url: string) => Promise<{ success: boolean }>;
      onInspectorStopped: (callback: (data: { serverName: string, code: number | null }) => void) => void;
      // Profile management functions
      createProfile: (name: string, configPath: string, backupPath: string, mcpClientPath: string | null) => Promise<number>;
      getAllProfiles: () => Promise<Profile[]>;
      getProfile: (id: number) => Promise<Profile | undefined>;
      switchProfile: (id: number) => Promise<{ success: boolean, error?: string }>;
      saveProfile: (id: number, content: string) => Promise<{ success: boolean, error?: string }>;
      remixProfile: (id: number, newName: string) => Promise<{ success: boolean, id?: number, error?: string }>;
      deleteProfile: (id: number) => Promise<{ success: boolean, error?: string }>;
    };
  }
}

console.log('Preload script completed');
