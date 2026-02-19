import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SmartToolRegistry } from '@/agent/smart-registry';

describe('SmartToolRegistry', () => {
    let registry: SmartToolRegistry;

    beforeEach(() => {
        registry = new SmartToolRegistry();
    });

    it('should initialize with default categories', () => {
        const categories = registry.listCategories();
        expect(categories.length).toBeGreaterThanOrEqual(3);
        expect(categories.map(c => c.id)).toContain('ui_style');
    });

    it('should generate a tool for a valid target and action', () => {
        const tool = registry.generateTool('ui_style', 'button', 'set');
        expect(tool).not.toBeNull();
        expect(tool?.id).toBe('set_button_ui_style');
        expect(tool?.parameters.properties).toHaveProperty('target');
    });

    it('should return null for an invalid target in a category', () => {
        const tool = registry.generateTool('ui_style', 'non-existent', 'set');
        expect(tool).toBeNull();
    });

    it('should cache generated tools', () => {
        const tool1 = registry.generateTool('ui_style', 'button', 'set');
        const tool2 = registry.generateTool('ui_style', 'button', 'set');
        expect(tool1).toBe(tool2);
    });

    it('should execute a generated tool successfully', async () => {
        const tool = registry.generateTool('ui_style', 'background', 'set');
        expect(tool).not.toBeNull();

        const result = await registry.executeTool(tool!.id, { value: 'red' });
        expect(result.success).toBe(true);
    });

    it('should fail execution if validation fails', async () => {
        const tool = registry.generateTool('ui_style', 'background', 'set');
        expect(tool).not.toBeNull();

        // ui_style validator requires p.value or p.css
        const result = await registry.executeTool(tool!.id, { something: 'else' });
        expect(result.success).toBe(false);
        expect(result.error).toContain('Validation failed');
    });
});
