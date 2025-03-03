import React, { useState, useEffect } from 'react';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onMessage: (message: string) => void;
    initialSettings: {
        configPath: string;
        backupPath: string;
        claudePath: string;
    };
}

const SettingsModal: React.FC<SettingsModalProps> = ({ 
    isOpen, 
    onClose, 
    onMessage,
    initialSettings 
}) => {
    const [configPath, setConfigPath] = useState(initialSettings.configPath);
    const [backupPath, setBackupPath] = useState(initialSettings.backupPath);
    const [claudePath, setClaudePath] = useState(initialSettings.claudePath);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        // Update state when initialSettings change
        setConfigPath(initialSettings.configPath);
        setBackupPath(initialSettings.backupPath);
        setClaudePath(initialSettings.claudePath);
    }, [initialSettings]);

    const handleSave = async () => {
        setIsLoading(true);
        try {
            const result = await window.electron.saveSettings({
                configPath,
                backupPath,
                claudePath
            });
            
            if (result) {
                // Update the initialSettings with the new values
                initialSettings.configPath = configPath;
                initialSettings.backupPath = backupPath;
                initialSettings.claudePath = claudePath;
                
                onMessage('✓ Settings saved successfully');
                onClose();
            } else {
                throw new Error('Failed to save settings');
            }
        } catch (err: any) {
            console.error('Error saving settings:', err);
            onMessage(`❌ Error saving settings: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleBrowseConfigPath = async () => {
        try {
            const path = await window.electron.browseConfigPath();
            if (path) {
                setConfigPath(path);
            }
        } catch (err: any) {
            console.error('Error browsing for config path:', err);
            onMessage(`❌ Error browsing for config path: ${err.message}`);
        }
    };

    const handleBrowseBackupPath = async () => {
        try {
            const path = await window.electron.browseBackupPath();
            if (path) {
                setBackupPath(path);
            }
        } catch (err: any) {
            console.error('Error browsing for backup path:', err);
            onMessage(`❌ Error browsing for backup path: ${err.message}`);
        }
    };

    const handleBrowseClaudePath = async () => {
        try {
            const path = await window.electron.browseClaudePath();
            if (path) {
                setClaudePath(path);
            }
        } catch (err: any) {
            console.error('Error browsing for Claude path:', err);
            onMessage(`❌ Error browsing for Claude path: ${err.message}`);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-[#222222] rounded-lg p-6 w-full max-w-md">
                <h2 className="text-xl font-bold mb-4">Settings</h2>
                
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">
                            Configuration Path
                        </label>
                        <div className="flex">
                            <input
                                type="text"
                                value={configPath}
                                onChange={(e) => setConfigPath(e.target.value)}
                                className="flex-1 p-2 bg-gray-700 text-white border border-gray-600 rounded-l"
                                placeholder="Path to configuration file"
                            />
                            <button
                                onClick={handleBrowseConfigPath}
                                className="px-3 py-2 bg-blue-600 text-white rounded-r hover:bg-blue-700"
                                disabled={isLoading}
                            >
                                Browse
                            </button>
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                            Path to the MCP configuration file
                        </p>
                    </div>
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">
                            Backup Path
                        </label>
                        <div className="flex">
                            <input
                                type="text"
                                value={backupPath}
                                onChange={(e) => setBackupPath(e.target.value)}
                                className="flex-1 p-2 bg-gray-700 text-white border border-gray-600 rounded-l"
                                placeholder="Path to backup directory"
                            />
                            <button
                                onClick={handleBrowseBackupPath}
                                className="px-3 py-2 bg-blue-600 text-white rounded-r hover:bg-blue-700"
                                disabled={isLoading}
                            >
                                Browse
                            </button>
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                            Directory where configuration backups will be stored
                        </p>
                    </div>
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">
                            Claude Path
                        </label>
                        <div className="flex">
                            <input
                                type="text"
                                value={claudePath}
                                onChange={(e) => setClaudePath(e.target.value)}
                                className="flex-1 p-2 bg-gray-700 text-white border border-gray-600 rounded-l"
                                placeholder="Path to Claude executable"
                            />
                            <button
                                onClick={handleBrowseClaudePath}
                                className="px-3 py-2 bg-blue-600 text-white rounded-r hover:bg-blue-700"
                                disabled={isLoading}
                            >
                                Browse
                            </button>
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                            Path to the Claude executable for restart functionality
                        </p>
                    </div>
                </div>
                
                <div className="flex justify-end space-x-3 mt-6">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
                        disabled={isLoading}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                        disabled={isLoading}
                    >
                        {isLoading ? 'Saving...' : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
