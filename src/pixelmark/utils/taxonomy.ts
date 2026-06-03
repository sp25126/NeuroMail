/**
 * Marker Taxonomy Refinement (7D)
 * Simplified categories mapping to real-world QA and client feedback.
 */

export type MarkerCategory = 
  | 'layout'        // Visual alignment, spacing, sizing
  | 'copy_text'     // Typos, content clarity, tone
  | 'interaction'   // Hover states, clicks, buttons not working
  | 'navigation'    // Broken links, menu issues, redirect loops
  | 'rendering'     // Glitches, flickering, z-index issues
  | 'canvas_3d'     // WebGL specific issues, texture errors
  | 'performance'   // Lag, slow loading
  | 'other';

export interface MarkerTaxonomy {
  id: MarkerCategory;
  label: string;
  icon: string;
  description: string;
}

export const markerCategories: MarkerTaxonomy[] = [
  { id: 'layout', label: 'Layout', icon: 'layout', description: 'Visual alignment or spacing issues' },
  { id: 'copy_text', label: 'Copy & Text', icon: 'type', description: 'Typos or content changes' },
  { id: 'interaction', label: 'Interaction', icon: 'mouse-pointer', description: 'Buttons or interactive elements' },
  { id: 'navigation', label: 'Navigation', icon: 'map', description: 'Links and page flow' },
  { id: 'rendering', label: 'Rendering', icon: 'image', description: 'Visual glitches or display bugs' },
  { id: 'canvas_3d', label: 'Canvas / 3D', icon: 'box', description: 'WebGL or 3D specific issues' },
  { id: 'performance', label: 'Performance', icon: 'zap', description: 'Lag or slow responsiveness' },
  { id: 'other', label: 'Other', icon: 'more-horizontal', description: 'General feedback' }
];

/**
 * Default classification logic based on context
 */
export const suggestCategory = (context: {
  tagName?: string;
  isCanvas?: boolean;
  hasLink?: boolean;
}): MarkerCategory => {
  if (context.isCanvas) return 'canvas_3d';
  if (context.hasLink || context.tagName === 'A') return 'navigation';
  if (['P', 'H1', 'H2', 'H3', 'SPAN'].includes(context.tagName || '')) return 'copy_text';
  if (['BUTTON', 'INPUT', 'SELECT'].includes(context.tagName || '')) return 'interaction';
  
  return 'layout'; // Default fallback
};
