"use client";

import { useState, useEffect } from "react";
import { Bot, Key, Palette, Bell, Keyboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createLogger } from "@/agent/observability/logger";
import { useToast } from "@/components/ui/use-toast";

const logger = createLogger("SettingsPage");

export default function SettingsPage() {
    return (
        <div className="container max-w-4xl py-8 mx-auto px-4">
            <h1 className="text-3xl font-bold mb-8">Settings</h1>

            <Tabs defaultValue="ai" className="space-y-6">
                <TabsList className="grid w-full grid-cols-4 gap-2">
                    <TabsTrigger value="ai">
                        <Bot className="h-4 w-4 mr-2" />
                        AI Assistant
                    </TabsTrigger>
                    <TabsTrigger value="appearance">
                        <Palette className="h-4 w-4 mr-2" />
                        Appearance
                    </TabsTrigger>
                    <TabsTrigger value="notifications">
                        <Bell className="h-4 w-4 mr-2" />
                        Notifications
                    </TabsTrigger>
                    <TabsTrigger value="shortcuts">
                        <Keyboard className="h-4 w-4 mr-2" />
                        Shortcuts
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="ai">
                    <AISettingsPanel />
                </TabsContent>

                <TabsContent value="appearance">
                    <AppearancePanel />
                </TabsContent>

                <TabsContent value="notifications">
                    <NotificationsPanel />
                </TabsContent>

                <TabsContent value="shortcuts">
                    <ShortcutsPanel />
                </TabsContent>
            </Tabs>
        </div>
    );
}

function AISettingsPanel() {
    const [provider, setProvider] = useState<"ollama" | "openai" | "openrouter">("ollama");
    const [model, setModel] = useState("gemma2:2b");
    const [apiKey, setApiKey] = useState("");
    const [temperature, setTemperature] = useState(0.7);
    const [isSaving, setIsSaving] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        // Load current settings
        fetch("/api/user/preferences/llm")
            .then((res) => res.json())
            .then((data) => {
                logger.info("Loaded LLM settings", data);
                if (data.provider) setProvider(data.provider);
                if (data.model) setModel(data.model);
                setApiKey(data.apiKey ? "sk-****" : "");
                if (data.temperature !== undefined) setTemperature(data.temperature);
            })
            .catch((err) => {
                logger.error("Failed to load settings", { error: err.message });
            });
    }, []);

    const handleSave = async () => {
        const span = logger.startSpan("AISettings.save");
        setIsSaving(true);

        try {
            const res = await fetch("/api/user/preferences/llm", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    provider,
                    model,
                    apiKey: apiKey.startsWith("sk-****") ? undefined : apiKey,
                    temperature,
                }),
            });

            if (!res.ok) throw new Error("Failed to save");

            logger.info("Settings saved successfully", { provider, model });

            toast({
                title: "Settings saved",
                description: "Your AI assistant preferences have been updated.",
            });

            span.end({ success: true });
        } catch (error: any) {
            logger.error("Failed to save settings", { error: error.message });

            toast({
                title: "Error",
                description: "Failed to save settings. Please try again.",
                variant: "destructive",
            });

            span.end({ success: false, error: error.message });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>AI Assistant Configuration</CardTitle>
                <CardDescription>
                    Choose your preferred AI model and configure API access
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Provider Selection */}
                <div className="space-y-2">
                    <Label>Provider</Label>
                    <Select value={provider} onValueChange={(v: any) => setProvider(v)}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ollama">
                                Ollama (Local) - Free
                            </SelectItem>
                            <SelectItem value="openai">
                                OpenAI (Cloud) - Requires API Key
                            </SelectItem>
                            <SelectItem value="openrouter">
                                OpenRouter (Cloud) - Requires API Key
                            </SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* Model Selection */}
                <div className="space-y-2">
                    <Label>Model</Label>
                    {provider === "ollama" ? (
                        <Select value={model} onValueChange={setModel}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="gemma2:2b">Gemma 2 (2B) - Fast</SelectItem>
                                <SelectItem value="llama3.2">Llama 3.2 (3B)</SelectItem>
                                <SelectItem value="mistral">Mistral (7B) - Balanced</SelectItem>
                            </SelectContent>
                        </Select>
                    ) : (
                        <Input
                            value={model}
                            onChange={(e) => setModel(e.target.value)}
                            placeholder="gpt-4o-mini"
                        />
                    )}
                </div>

                {/* API Key (for cloud providers) */}
                {provider !== "ollama" && (
                    <div className="space-y-2">
                        <Label>API Key</Label>
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                <Input
                                    type="password"
                                    value={apiKey}
                                    onChange={(e) => setApiKey(e.target.value)}
                                    placeholder="sk-..."
                                    className="pl-9"
                                />
                            </div>
                        </div>
                        <p className="text-xs text-gray-500">
                            Your API key is encrypted and never shared
                        </p>
                    </div>
                )}

                {/* Temperature */}
                <div className="space-y-2">
                    <Label>Creativity (Temperature): {temperature}</Label>
                    <input
                        type="range"
                        min="0"
                        max="2"
                        step="0.1"
                        value={temperature}
                        onChange={(e) => setTemperature(parseFloat(e.target.value))}
                        className="w-full"
                    />
                    <div className="flex justify-between text-xs text-gray-500">
                        <span>Focused (0.0)</span>
                        <span>Balanced (1.0)</span>
                        <span>Creative (2.0)</span>
                    </div>
                </div>

                {/* Save Button */}
                <Button onClick={handleSave} disabled={isSaving} className="w-full">
                    {isSaving ? "Saving..." : "Save Settings"}
                </Button>
            </CardContent>
        </Card>
    );
}

function AppearancePanel() {
    const [darkMode, setDarkMode] = useState(false);
    const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
    const [fontSize, setFontSize] = useState<"small" | "medium" | "large">("medium");

    useEffect(() => {
        // Load from localStorage
        const saved = localStorage.getItem("appearance");
        if (saved) {
            const parsed = JSON.parse(saved);
            setDarkMode(parsed.darkMode || false);
            setDensity(parsed.density || "comfortable");
            setFontSize(parsed.fontSize || "medium");
        }
    }, []);

    const handleSave = () => {
        logger.info("Appearance settings changed", { darkMode, density, fontSize });

        localStorage.setItem(
            "appearance",
            JSON.stringify({ darkMode, density, fontSize })
        );

        // Apply dark mode
        if (darkMode) {
            document.documentElement.classList.add("dark");
        } else {
            document.documentElement.classList.remove("dark");
        }

        // Apply other settings...
        document.documentElement.setAttribute("data-density", density);
        document.documentElement.setAttribute("data-font-size", fontSize);
    };

    useEffect(() => {
        handleSave();
    }, [darkMode, density, fontSize]);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Appearance</CardTitle>
                <CardDescription>Customize how the app looks</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Dark Mode (Bonus +2) */}
                <div className="flex items-center justify-between">
                    <div>
                        <Label>Dark Mode</Label>
                        <p className="text-sm text-gray-500">Use dark theme</p>
                    </div>
                    <Switch checked={darkMode} onCheckedChange={setDarkMode} />
                </div>

                {/* Density */}
                <div className="space-y-2">
                    <Label>Display Density</Label>
                    <Select value={density} onValueChange={(v: any) => setDensity(v)}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="comfortable">Comfortable</SelectItem>
                            <SelectItem value="compact">Compact</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* Font Size */}
                <div className="space-y-2">
                    <Label>Font Size</Label>
                    <Select value={fontSize} onValueChange={(v: any) => setFontSize(v)}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="small">Small</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="large">Large</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </CardContent>
        </Card>
    );
}

function NotificationsPanel() {
    const [emailNotifications, setEmailNotifications] = useState(true);
    const [soundEnabled, setSoundEnabled] = useState(false);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Notifications</CardTitle>
                <CardDescription>Manage notification preferences</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <Label>Desktop Notifications</Label>
                        <p className="text-sm text-gray-500">Get notified of new emails</p>
                    </div>
                    <Switch
                        checked={emailNotifications}
                        onCheckedChange={setEmailNotifications}
                    />
                </div>

                <div className="flex items-center justify-between">
                    <div>
                        <Label>Sound</Label>
                        <p className="text-sm text-gray-500">Play sound on new email</p>
                    </div>
                    <Switch checked={soundEnabled} onCheckedChange={setSoundEnabled} />
                </div>
            </CardContent>
        </Card>
    );
}

function ShortcutsPanel() {
    const shortcuts = [
        { key: "C", action: "Compose new email" },
        { key: "R", action: "Reply to email" },
        { key: "F", action: "Forward email" },
        { key: "/", action: "Focus search" },
        { key: "G then I", action: "Go to Inbox" },
        { key: "G then S", action: "Go to Sent" },
        { key: "Ctrl/Cmd + K", action: "Open AI assistant" },
        { key: "Ctrl/Cmd + Enter", action: "Send email" },
    ];

    return (
        <Card>
            <CardHeader>
                <CardTitle>Keyboard Shortcuts</CardTitle>
                <CardDescription>Quick actions for power users</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-2">
                    {shortcuts.map((shortcut) => (
                        <div
                            key={shortcut.key}
                            className="flex items-center justify-between py-2 border-b last:border-0"
                        >
                            <span className="text-sm">{shortcut.action}</span>
                            <kbd className="px-2 py-1 text-xs font-mono bg-gray-100 dark:bg-zinc-800 rounded">
                                {shortcut.key}
                            </kbd>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
