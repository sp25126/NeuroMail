/**
 * Core types for the Smart Tool Registry
 */

export type ToolDomain = 'style' | 'layout' | 'content' | 'navigation' | 'data';

export interface ToolCategory {
    id: string;
    domain: ToolDomain;
    targets: string[];
    actions: string[];
    properties?: string[];
    validator: (params: any) => boolean;
    executor: (target: string, action: string, params: any) => void;
}

export interface GeneratedTool {
    id: string;
    name: string;
    description: string;
    parameters: {
        type: 'object';
        properties: Record<string, any>;
        required?: string[];
    };
    category: string;
    target: string;
    action: string;
}

export interface SmartToolResult {
    success: boolean;
    result?: any;
    error?: string;
    code?: string; // If JS was generated
}
