import React, { useState, useEffect } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';
import { useSettingsStore } from '@/store/useSettingsStore';
import { persistenceManager } from '@/agent/persistence';
import { toast } from 'sonner';

export function PersistenceToggle() {
    const { persistAIChanges, updateSettings } = useSettingsStore();
    const [showWarning, setShowWarning] = useState(false);

    // Sync persistence manager with store on mount/update
    useEffect(() => {
        persistenceManager.setMode(persistAIChanges ? 'permanent' : 'temporary');
    }, [persistAIChanges]);

    const handleToggle = (checked: boolean) => {
        if (checked) {
            setShowWarning(true);
        } else {
            updateSettings({ persistAIChanges: false });
            persistenceManager.setMode('temporary');
            toast.info('AI changes are now temporary');
        }
    };

    const confirmPermanent = () => {
        updateSettings({ persistAIChanges: true });
        persistenceManager.setMode('permanent');
        setShowWarning(false);
        toast.success('AI changes will now persist across sessions');
    };

    return (
        <div className="flex items-center justify-between space-x-2 py-4">
            <div className="space-y-1">
                <Label htmlFor="persistence-mode" className="text-base font-medium">
                    Permanent AI Changes
                </Label>
                <p className="text-sm text-gray-400">
                    {persistAIChanges
                        ? "AI modifications are saved to database and restored on reload."
                        : "AI modifications are temporary and clear on page refresh."}
                </p>
            </div>

            <Switch
                id="persistence-mode"
                checked={persistAIChanges}
                onCheckedChange={handleToggle}
            />

            {/* Custom Modal Backup since Dialog component is missing */}
            {showWarning && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-[#1e1e2e] border border-white/10 rounded-xl w-full max-w-md p-6 shadow-2xl animate-in fade-in zoom-in duration-200">
                        <div className="flex items-center gap-2 text-amber-500 mb-4">
                            <AlertCircle className="w-6 h-6" />
                            <h3 className="text-lg font-bold">Enable Permanent Changes?</h3>
                        </div>

                        <p className="text-sm text-gray-300 mb-6 leading-relaxed">
                            This will save all AI-driven UI modifications to the database and automatically restore them whenever you visit the app.
                            <br /><br />
                            <strong className="text-amber-400">Warning:</strong> Malformed changes could persist and break the UI. You can always revert to temporary mode to clear them.
                        </p>

                        <div className="flex justify-end gap-3">
                            <Button variant="outline" onClick={() => setShowWarning(false)}>
                                Cancel
                            </Button>
                            <Button onClick={confirmPermanent} className="bg-amber-600 hover:bg-amber-700 text-white">
                                Enable Permanent Mode
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
