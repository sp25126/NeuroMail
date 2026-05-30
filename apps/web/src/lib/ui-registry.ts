export interface UIOperation {
    id: string;
    type: "button" | "input" | "toggle" | "modal" | "navigation" | "filter" | "action";
    label: string;
    description: string;
    parameters?: {
        name: string;
        type: "string" | "boolean" | "number" | "enum";
        description: string;
        enum?: string[];
        required?: boolean;
    }[];
    execute: (params?: any) => void | Promise<void>;
    metadata?: {
        category?: string;
        priority?: number;
        keywords?: string[];
    };
}

class UIRegistry {
    private operations: Map<string, UIOperation> = new Map();
    private listeners: Set<() => void> = new Set();

    /**
     * Register a UI operation
     */
    register(operation: UIOperation) {
        // console.log("📋 [UI_REGISTRY] Registering:", operation.id);
        this.operations.set(operation.id, operation);
        this.notifyListeners();
    }

    /**
     * Unregister an operation (when component unmounts)
     */
    unregister(id: string) {
        // console.log("📋 [UI_REGISTRY] Unregistering:", id);
        this.operations.delete(id);
        this.notifyListeners();
    }

    /**
     * Get all registered operations
     */
    getAll(): UIOperation[] {
        return Array.from(this.operations.values());
    }

    /**
     * Get operation by ID
     */
    get(id: string): UIOperation | undefined {
        return this.operations.get(id);
    }

    /**
     * Execute an operation
     */
    async execute(id: string, params?: any): Promise<boolean> {
        const operation = this.operations.get(id);

        if (!operation) {
            console.error("❌ [UI_REGISTRY] Operation not found:", id);
            return false;
        }

        try {
            console.log("⚡ [UI_REGISTRY] Executing:", id, params);
            await operation.execute(params);
            return true;
        } catch (error: any) {
            console.error("❌ [UI_REGISTRY] Execution failed:", error);
            return false;
        }
    }

    /**
     * Subscribe to registry changes
     */
    subscribe(listener: () => void) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private notifyListeners() {
        this.listeners.forEach(listener => listener());
    }

    /**
     * Get operations by category
     */
    getByCategory(category: string): UIOperation[] {
        return this.getAll().filter(op => op.metadata?.category === category);
    }

    /**
     * Search operations by keyword
     */
    search(query: string): UIOperation[] {
        const lowerQuery = query.toLowerCase();
        return this.getAll().filter(op =>
            op.label.toLowerCase().includes(lowerQuery) ||
            op.description.toLowerCase().includes(lowerQuery) ||
            op.metadata?.keywords?.some(kw => kw.toLowerCase().includes(lowerQuery))
        );
    }
}

// Singleton instance
export const uiRegistry = new UIRegistry();
