import React, { useState } from 'react';

interface RawConfigModalProps {
    isOpen: boolean;
    onClose: () => void;
    onMessage: (message: string) => void;
    initialConfig: string;
    onSave: (config: string) => Promise<void>;
}

const RawConfigModal: React.FC<RawConfigModalProps> = ({ 
    isOpen, 
    onClose, 
    onMessage,
    initialConfig,
    onSave
}) => {
    const [configText, setConfigText] = useState(initialConfig);
    const [isLoading, setIsLoading] = useState(false);
    const [validationError, setValidationError] = useState<string | null>(null);

    const handleSave = async () => {
        setIsLoading(true);
        setValidationError(null);
        
        try {
            // Validate JSON
            try {
                JSON.parse(configText);
            } catch (err: any) {
                setValidationError(`Invalid JSON: ${err.message}`);
                throw new Error(`Invalid JSON: ${err.message}`);
            }
            
            // Check for required mcpServers object
            const config = JSON.parse(configText);
            if (!config.mcpServers || typeof config.mcpServers !== 'object') {
                setValidationError('Configuration must contain an mcpServers object');
                throw new Error('Configuration must contain an mcpServers object');
            }
            
            // Save the configuration
            await onSave(configText);
            onMessage('✓ Configuration saved successfully');
            onClose();
        } catch (err: any) {
            console.error('Error saving configuration:', err);
            onMessage(`❌ Error saving configuration: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const formatJson = () => {
        try {
            const parsed = JSON.parse(configText);
            setConfigText(JSON.stringify(parsed, null, 2));
            setValidationError(null);
        } catch (err: any) {
            setValidationError(`Cannot format: ${err.message}`);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-[#222222] rounded-lg p-6 w-full max-w-4xl h-3/4 flex flex-col">
                <h2 className="text-xl font-bold mb-4">Raw Configuration</h2>
                
                {validationError && (
                    <div className="mb-4 p-3 bg-red-900 text-red-100 border border-red-600 rounded">
                        {validationError}
                    </div>
                )}
                
                <div className="flex-1 mb-4 relative">
                    <textarea
                        value={configText}
                        onChange={(e) => setConfigText(e.target.value)}
                        className="w-full h-full p-3 bg-gray-800 text-white font-mono text-sm border border-gray-700 rounded resize-none"
                        placeholder="Paste your JSON configuration here"
                        spellCheck="false"
                    />
                </div>
                
                <div className="flex justify-between">
                    <button
                        onClick={formatJson}
                        className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
                        disabled={isLoading}
                    >
                        Format JSON
                    </button>
                    
                    <div className="space-x-3">
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
        </div>
    );
};

export default RawConfigModal;
