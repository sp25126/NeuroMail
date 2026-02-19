/**
 * Types for DOM Introspection and Page Structure
 */

export type LayoutType = 'single' | 'two-column' | 'three-column';

export interface Section {
    id: string;
    role: string;
    label?: string;
    visible: boolean;
    rect: DOMRectSummary;
}

export interface DOMRectSummary {
    top: number;
    left: number;
    width: number;
    height: number;
}

export interface ElementSummary {
    id: string;
    type: string;
    role: string;
    text?: string;
    visible: boolean;
    disabled?: boolean;
    rect: DOMRectSummary;
    capabilities: string[]; // ['click', 'type', 'drag']
}

export interface PageStructure {
    layout: LayoutType;
    sections: Section[];
    interactiveElements: ElementSummary[];
    currentView: string;
    timestamp: number;
}

export interface ElementMetadata {
    id: string;
    tagName: string;
    classes: string[];
    attributes: Record<string, string>;
    rect: DOMRectSummary;
    computedStyles: Record<string, string>;
}
