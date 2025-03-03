declare interface Profile {
    id: number;
    name: string;
    config_path: string;
    backup_path: string;
    mcp_client_path: string | null;
    created_at: string;
    updated_at: string;
}

declare interface InspectorStatus {
    serverName: string;
    url: string;
    running: boolean;
}

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
