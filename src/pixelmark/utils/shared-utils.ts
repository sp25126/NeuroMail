/**
 * PixelMark Shared Utilities
 * Centralized logic for asset rewriting, detection, and session state.
 */

// 1. Asset Rewriting
export const rewriteAssetUrl = (url: string, proxyUrl: string = '/api/proxy'): string => {
  if (!url || url.startsWith('data:') || url.startsWith('blob:')) return url;
  
  // Only rewrite if it's a cross-origin asset that might taint canvas
  const isExternal = url.startsWith('http') && !url.includes(window.location.host);
  if (isExternal) {
    return `${proxyUrl}?url=${encodeURIComponent(url)}`;
  }
  return url;
};

// 2. Renderer Detection
export const detectRendererMode = () => {
  const hasWebGL = () => {
    try {
      const canvas = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
    } catch (e) {
      return false;
    }
  };

  const isMobile = () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  return {
    useHeavyRender: hasWebGL() && !isMobile(),
    isLowPower: isMobile(),
    supportsCapture: !!navigator.mediaDevices?.getDisplayMedia || !!document.createElement('canvas').captureStream
  };
};

// 3. Centralized Session State Interface
export interface PixelMarkSession {
  id: string;
  projectId: string;
  targetUrl: string;
  mode: 'dom' | 'heavy' | 'fallback';
  status: 'initializing' | 'active' | 'paused' | 'error';
  metadata: {
    userAgent: string;
    viewport: { width: number; height: number };
    startTime: number;
  };
}

// 4. Component Boundary Definitions
export const Boundaries = {
  Shell: 'shell',           // The outer container and navigation
  Proxy: 'proxy',           // Asset interception and iframe handling
  Agent: 'agent',           // Scripts injected into the target page
  Capture: 'capture',       // Canvas/DOM snapshotting logic
  CommandCenter: 'cc'       // User interface for feedback and controls
};
