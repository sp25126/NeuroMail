import React, { useState } from 'react';
import { useUIStore } from '@/store/uiStore';
import { History, RotateCcw, Trash2, X } from 'lucide-react';

export const AIChangesPanel: React.FC = () => {
    // Connect directly to Zustand store - reactive by default
    const changes = useUIStore((state) => state.aiPendingChanges);
    const { clearChanges, revertChanges } = useUIStore();

    const [isOpen, setIsOpen] = useState(false);

    // Auto-open panel when new changes arrive (optional UX enhancement)
    // useEffect(() => { if (changes.length > 0) setIsOpen(true); }, [changes.length]);

    if (!isOpen) {
        if (changes.length === 0) return null; // Hide completely if empty and closed

        return (
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-4 left-4 z-50 p-2 bg-gray-900 border border-gray-700 rounded-full shadow-lg hover:bg-gray-800 transition-colors text-white"
                title="AI Changes History"
            >
                <History className="w-5 h-5" />
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 rounded-full text-[10px] flex items-center justify-center">
                    {changes.length}
                </span>
            </button>
        );
    }

    return (
        <div className="fixed bottom-4 left-4 z-50 w-80 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl flex flex-col max-h-[500px]">
            {/* Header */}
            <div className="p-3 border-b border-gray-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-blue-400" />
                    <span className="font-medium text-sm text-gray-200">AI Changes</span>
                    <span className="text-xs text-gray-500">({changes.length})</span>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => clearChanges()}
                        className="p-1 hover:bg-gray-800 rounded text-gray-400 hover:text-red-400"
                        title="Clear History"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={() => setIsOpen(false)}
                        className="p-1 hover:bg-gray-800 rounded text-gray-400"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {changes.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 text-xs">
                        No changes tracked yet.
                    </div>
                ) : (
                    changes.map((change) => (
                        <div key={change.id} className="bg-gray-800/50 p-2 rounded border border-gray-800 text-xs">
                            <div className="flex items-start justify-between mb-1">
                                <span className="font-mono text-yellow-500/80 truncate w-48" title={change.target}>
                                    {change.description || change.operation}
                                </span>
                                <span className="text-gray-600 text-[10px]">
                                    {new Date(change.timestamp).toLocaleTimeString()}
                                </span>
                            </div>
                            {(change.oldValue !== undefined || change.newValue !== undefined) && (
                                <div className="grid grid-cols-[auto_1fr] gap-2 text-gray-400">
                                    <span>Prop:</span>
                                    <span className="text-gray-300">{change.property || "style"}</span>

                                    <span>Val:</span>
                                    <div className="truncate text-gray-300 font-mono">
                                        <span className="text-red-400/70">{String(change.oldValue ?? "")}</span>
                                        {' → '}
                                        <span className="text-green-400/70">{String(change.newValue ?? "")}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>

            {/* Footer / Generic Rollback (Last 1) */}
            <div className="p-2 border-t border-gray-800">
                <button
                    onClick={() => revertChanges()}
                    disabled={changes.length === 0}
                    className="w-full py-1.5 px-3 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed rounded flex items-center justify-center gap-2 text-sm text-gray-300 transition-colors"
                >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reset AI Changes
                </button>
            </div>
        </div>
    );
};
