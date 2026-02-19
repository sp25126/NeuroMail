import { ToolCategory, GeneratedTool, SmartToolResult } from './types';

/**
 * SmartToolRegistry: Manages dynamic tool generation based on categories
 */
export class SmartToolRegistry {
    private categories: Map<string, ToolCategory> = new Map();
    private generatedCache: Map<string, GeneratedTool> = new Map();

    constructor() {
        this.initializeDefaults();
    }

    /**
     * Register a new tool category
     */
    registerCategory(category: ToolCategory): void {
        this.categories.set(category.id, category);
        console.log(`📡 [SMART-REGISTRY] Category registered: ${category.id}`);
    }

    /**
     * Find categories that match a specific domain
     */
    findCategoriesByDomain(domain: string): ToolCategory[] {
        return Array.from(this.categories.values()).filter(c => c.domain === domain);
    }

    /**
     * Generate a tool from a category, target, and action
     */
    generateTool(categoryId: string, target: string, action: string, properties: string[] = []): GeneratedTool | null {
        const category = this.categories.get(categoryId);
        if (!category) return null;

        if (!category.targets.includes(target) && !category.targets.includes('*')) return null;
        if (!category.actions.includes(action) && !category.actions.includes('*')) return null;

        const toolId = `${action}_${target}_${categoryId}`.toLowerCase().replace(/[^a-z0-9_]/g, '_');

        // Cache check
        if (this.generatedCache.has(toolId)) {
            return this.generatedCache.get(toolId)!;
        }

        const tool: GeneratedTool = {
            id: toolId,
            name: toolId,
            description: `${action} ${target} in ${category.domain} domain`,
            parameters: {
                type: 'object',
                properties: {
                    target: { type: 'string', description: 'The specific element or target' },
                    action: { type: 'string', description: 'Action to perform' },
                    params: { type: 'object', description: 'Additional parameters' }
                },
                required: ['target', 'action']
            },
            category: categoryId,
            target,
            action
        };

        this.generatedCache.set(toolId, tool);
        return tool;
    }

    /**
     * Execute a dynamically generated tool
     */
    async executeTool(toolId: string, params: any): Promise<SmartToolResult> {
        const tool = this.generatedCache.get(toolId);
        if (!tool) {
            return { success: false, error: `Tool ${toolId} not found in cache` };
        }

        const category = this.categories.get(tool.category);
        if (!category) {
            return { success: false, error: `Category ${tool.category} lost` };
        }

        try {
            if (category.validator && !category.validator(params)) {
                return { success: false, error: `Validation failed for ${toolId}` };
            }

            // In a real browser environment, this would call UI logic
            // For now, we delegate to the category's executor
            category.executor(tool.target, tool.action, params);

            return { success: true };
        } catch (e) {
            return { success: false, error: e instanceof Error ? e.message : String(e) };
        }
    }

    /**
     * List all categories for prompt generation
     */
    listCategories(): ToolCategory[] {
        return Array.from(this.categories.values());
    }

    /**
     * Initialize with core domains
     */
    private initializeDefaults() {
        // 1. STYLE Domain
        this.registerCategory({
            id: 'ui_style',
            domain: 'style',
            targets: ['button', 'panel', 'sidebar', 'background', 'modal', 'text', 'input', 'list-item'],
            actions: ['set', 'animate', 'toggle', 'highlight', 'hide', 'show'],
            properties: ['color', 'size', 'padding', 'margin', 'font', 'visibility', 'rounded', 'opacity', 'theme'],
            validator: (p) => !!p.value || !!p.css || !!p.property,
            executor: (target, action, params) => {
                console.log(`🎨 [EXEC] STYLE ${action} on ${target} with`, params);
            }
        });

        // 2. LAYOUT Domain
        this.registerCategory({
            id: 'ui_layout',
            domain: 'layout',
            targets: ['grid', 'list', 'flex', 'container', 'sidebar-width', 'main-content', 'columns'],
            actions: ['resize', 'toggle', 'stack', 'align', 'expand', 'collapse'],
            properties: ['width', 'height', 'position', 'alignment', 'direction'],
            validator: (p) => !!p.value || !!p.state,
            executor: (target, action, params) => {
                console.log(`📐 [EXEC] LAYOUT ${action} on ${target} with`, params);
            }
        });

        // 3. CONTENT Domain
        this.registerCategory({
            id: 'ui_content',
            domain: 'content',
            targets: ['email-subject', 'email-body', 'contact-name', 'user-profile', 'toast', 'notification'],
            actions: ['update', 'replace', 'prepend', 'append', 'clear', 'inject'],
            properties: ['text', 'html', 'attachment-count', 'icon'],
            validator: (p) => !!p.text || !!p.content,
            executor: (target, action, params) => {
                console.log(`📝 [EXEC] CONTENT ${action} on ${target} with`, params);
            }
        });

        // 4. NAVIGATION Domain
        this.registerCategory({
            id: 'app_nav',
            domain: 'navigation',
            targets: ['view', 'folder', 'thread', 'settings', 'profile', 'search', 'compose'],
            actions: ['go', 'back', 'open', 'close', 'refresh', 'switch'],
            validator: (p) => !!p.id || !!p.name || !!p.path,
            executor: (target, action, params) => {
                console.log(`🗺️ [EXEC] NAV ${action} to ${target} with`, params);
            }
        });

        // 5. DATA Domain
        this.registerCategory({
            id: 'data_ops',
            domain: 'data',
            targets: ['email', 'thread', 'contact', 'folder', 'tag', 'attachment'],
            actions: ['find', 'search', 'filter', 'sort', 'group', 'tag', 'untag', 'star', 'unstar', 'archive', 'delete', 'trash', 'restore', 'read', 'unread'],
            validator: (p) => !!p.query || !!p.filter || !!p.id,
            executor: (target, action, params) => {
                console.log(`🔎 [EXEC] DATA ${action} on ${target} with`, params);
            }
        });
    }
}

export const smartToolRegistry = new SmartToolRegistry();
