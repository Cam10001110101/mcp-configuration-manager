import React, { useState, useEffect } from 'react';

interface Profile {
    id: number;
    name: string;
    config_path: string;
    backup_path: string;
    mcp_client_path: string | null;
    created_at: string;
    updated_at: string;
}

interface ProfileManagerProps {
    onMessage: (message: string) => void;
    onProfileSwitch: () => void;
}

const ProfileManager: React.FC<ProfileManagerProps> = ({ onMessage, onProfileSwitch }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [showRemixDialog, setShowRemixDialog] = useState(false);
    const [newProfileName, setNewProfileName] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // Load profiles on mount and select the first profile
    useEffect(() => {
        const initializeProfiles = async () => {
            try {
                const loadedProfiles = await loadProfiles();
                
                // If there are profiles and none is selected, select the first one
                if (loadedProfiles.length > 0 && !selectedProfile) {
                    console.log('Auto-selecting first profile:', loadedProfiles[0]);
                    handleSwitchProfile(loadedProfiles[0]);
                }
            } catch (err) {
                console.error('Error initializing profiles:', err);
            }
        };
        
        initializeProfiles();
    }, []);

    const loadProfiles = async () => {
        try {
            const loadedProfiles = await window.electron.getAllProfiles();
            setProfiles(loadedProfiles);
            return loadedProfiles;
        } catch (err: any) {
            onMessage(`❌ Error loading profiles: ${err.message}`);
            return [];
        }
    };

    const handleCreateProfile = async () => {
        if (!newProfileName.trim()) {
            onMessage('❌ Profile name cannot be empty');
            return;
        }

        setIsLoading(true);
        try {
            // Get current settings to use as defaults
            const settings = await window.electron.loadSettings();
            if (!settings) throw new Error('Failed to load settings');

            const id = await window.electron.createProfile(
                newProfileName,
                settings.configPath,
                settings.backupPath || '',
                settings.claudePath || null
            );

            // Try to load the current configuration instead of creating an empty one
            let configContent = JSON.stringify({ mcpServers: {} });
            try {
                if (settings.configPath) {
                    const result = await window.electron.loadConfigByPath(settings.configPath);
                    if (result && result.content) {
                        // Validate the content is valid JSON with mcpServers
                        const config = JSON.parse(result.content);
                        if (config && config.mcpServers && typeof config.mcpServers === 'object') {
                            configContent = result.content;
                            console.log('Using existing configuration for new profile');
                        }
                    }
                }
            } catch (loadErr) {
                console.warn('Could not load existing configuration:', loadErr);
                // Continue with empty configuration
            }

            // Save the configuration to the profile
            await window.electron.saveProfile(id, configContent);

            onMessage(`✓ Created profile "${newProfileName}"`);
            setShowCreateDialog(false);
            setNewProfileName('');
            await loadProfiles();
        } catch (err: any) {
            onMessage(`❌ Error creating profile: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleRemixProfile = async () => {
        if (!selectedProfile || !newProfileName.trim()) {
            onMessage('❌ Please select a profile and enter a new name');
            return;
        }

        setIsLoading(true);
        try {
            const result = await window.electron.remixProfile(selectedProfile.id, newProfileName);
            if (!result.success) {
                throw new Error(result.error);
            }

            onMessage(`✓ Created remix "${newProfileName}" from "${selectedProfile.name}"`);
            setShowRemixDialog(false);
            setNewProfileName('');
            await loadProfiles();
        } catch (err: any) {
            onMessage(`❌ Error creating remix: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSwitchProfile = async (profile: Profile) => {
        setIsLoading(true);
        try {
            const result = await window.electron.switchProfile(profile.id);
            if (!result.success) {
                throw new Error(result.error);
            }

            setSelectedProfile(profile);
            onMessage(`✓ Switched to profile "${profile.name}"`);
            onProfileSwitch(); // Trigger parent component to reload configuration
        } catch (err: any) {
            onMessage(`❌ Error switching profile: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteProfile = async (profile: Profile) => {
        if (!window.confirm(`Are you sure you want to delete profile "${profile.name}"?`)) {
            return;
        }

        setIsLoading(true);
        try {
            const result = await window.electron.deleteProfile(profile.id);
            if (!result.success) {
                throw new Error(result.error);
            }

            onMessage(`✓ Deleted profile "${profile.name}"`);
            if (selectedProfile?.id === profile.id) {
                setSelectedProfile(null);
            }
            await loadProfiles();
        } catch (err: any) {
            onMessage(`❌ Error deleting profile: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className={`h-full bg-[#222222] transition-all duration-300 ${isOpen ? 'w-64' : 'w-12'}`}>
            {/* Toggle Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full p-3 text-left hover:bg-[#2a2a2a] flex items-center"
                title={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            >
                <span className="text-xl">{isOpen ? '◀' : '▶'}</span>
                {isOpen && <span className="ml-2 font-semibold">Profiles</span>}
            </button>

            {/* Profile Management Section */}
            {isOpen && (
                <div className="p-3">
                    {/* Action Buttons */}
                    <div className="space-y-2 mb-4">
                        <button
                            onClick={() => setShowCreateDialog(true)}
                            className="w-full p-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center justify-center"
                            disabled={isLoading}
                        >
                            <span className="mr-2">+</span> Create New Profile
                        </button>
                        <button
                            onClick={() => setShowRemixDialog(true)}
                            className="w-full p-2 bg-green-600 text-white rounded hover:bg-green-700 flex items-center justify-center"
                            disabled={!selectedProfile || isLoading}
                        >
                            <span className="mr-2">⎇</span> Remix Profile
                        </button>
                        <button
                            className="w-full p-2 bg-gray-600 text-white rounded hover:bg-gray-700 flex items-center justify-center opacity-50 cursor-not-allowed"
                            disabled={true}
                            title="Coming soon"
                        >
                            <span className="mr-2">↗</span> Share Config
                        </button>
                    </div>

                    {/* Profile List */}
                    <div className="space-y-2">
                        {profiles.map(profile => (
                            <div
                                key={profile.id}
                                className={`p-2 rounded cursor-pointer ${
                                    selectedProfile?.id === profile.id
                                        ? 'bg-blue-600'
                                        : 'hover:bg-[#2a2a2a]'
                                }`}
                                onClick={() => handleSwitchProfile(profile)}
                            >
                                <div className="flex items-center justify-between">
                                    <span className="truncate">{profile.name}</span>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteProfile(profile);
                                        }}
                                        className="text-gray-400 hover:text-red-500"
                                        title="Delete profile"
                                    >
                                        ×
                                    </button>
                                </div>
                                {/* Path removed as per user request */}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Create Profile Dialog */}
            {showCreateDialog && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-[#222222] rounded-lg p-6 w-full max-w-md">
                        <h2 className="text-xl font-bold mb-4">Create New Profile</h2>
                        <input
                            type="text"
                            value={newProfileName}
                            onChange={(e) => setNewProfileName(e.target.value)}
                            placeholder="Profile name"
                            className="w-full p-2 mb-4 bg-gray-700 text-white border border-gray-600 rounded"
                            autoFocus
                        />
                        <div className="flex justify-end space-x-3">
                            <button
                                onClick={() => {
                                    setShowCreateDialog(false);
                                    setNewProfileName('');
                                }}
                                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
                                disabled={isLoading}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreateProfile}
                                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                                disabled={isLoading}
                            >
                                Create
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Remix Profile Dialog */}
            {showRemixDialog && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-[#222222] rounded-lg p-6 w-full max-w-md">
                        <h2 className="text-xl font-bold mb-4">Remix Profile</h2>
                        <p className="text-sm text-gray-400 mb-4">
                            Creating a remix of "{selectedProfile?.name}"
                        </p>
                        <input
                            type="text"
                            value={newProfileName}
                            onChange={(e) => setNewProfileName(e.target.value)}
                            placeholder="New profile name"
                            className="w-full p-2 mb-4 bg-gray-700 text-white border border-gray-600 rounded"
                            autoFocus
                        />
                        <div className="flex justify-end space-x-3">
                            <button
                                onClick={() => {
                                    setShowRemixDialog(false);
                                    setNewProfileName('');
                                }}
                                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
                                disabled={isLoading}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleRemixProfile}
                                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                                disabled={isLoading}
                            >
                                Create Remix
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProfileManager;
