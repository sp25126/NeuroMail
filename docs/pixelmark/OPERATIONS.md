# PixelMark Operations and Maintenance

This document provides internal operating notes for maintaining PixelMark after launch.

## Subsystem Overviews

### Heavy Render Mode
**What it is:** Uses an intensive headless WebGL context to perfectly capture rich 3D and canvas elements.
**How it works:** Spawns a dedicated WebWorker pool to snapshot elements that fail standard DOM-to-image conversion. 
**When to disable:** If clients report high CPU usage or frequent tab crashes (`heavy_render_mode` flag).

### Asset Rewriting & Conservative Proxy Mode
**What it is:** The proxy intercepts requests to third-party assets (images, fonts, scripts) to bypass CORS for canvas tainting.
**How it works:** Express middleware rewrites URLs to `/_proxy?url=...`
**Conservative Proxy Mode:** When enabled, it only proxies explicitly whitelisted domains to prevent abuse.

## Debugging Checklist

### Debugging Proxy Failures
1. Check monitoring for `proxy_asset_failure` spikes.
2. Verify if the target asset enforces strict `Cache-Control` or IP blocks.
3. Check the CircuitBreaker logs in `src/pixelmark/guardrails.ts`.
4. **Action:** If a specific domain is constantly failing, temporarily enable `conservative_proxy_mode`.

### Debugging Marker Capture
1. Ensure `canvas_capture` feature flag is enabled.
2. Look for `marker_create_failure` events.
3. Check if the element being captured is inside a cross-origin iframe.
4. **Action:** Ask user to use the partial render fallback.

### Debugging Mobile Layout Issues
1. Enable `mobile_performance_mode` via session override to disable heavy animations.
2. Ensure command center is collapsing correctly based on `iframe` layout constraints.

## Feature Flag Reference

Flags can be managed via `sessionStorage.setItem('pixelmark_flags', JSON.stringify({ flag_name: true/false }))` or Admin UI.

| Flag | Default | Description |
|---|---|---|
| `heavy_render_mode` | `true` | Enables high-fidelity WebGL/Canvas rendering. |
| `conservative_proxy_mode` | `false` | Restricts proxying to allowlisted domains only. |
| `canvas_capture` | `true` | Enables direct `<canvas>` capturing pipeline. |
| `mobile_performance_mode` | `false` | Disables heavy animations and forces lower DPI captures on mobile. |
| `partial_render_fallback` | `true` | Falls back to basic DOM capture if heavy render times out. |

## Disabling a Broken Feature Flag
To disable a flag globally without a redeploy:
1. Access the Admin Command Center.
2. Navigate to "Feature Flags".
3. Toggle the problematic flag (e.g., `heavy_render_mode`) to OFF.
4. The system will gracefully degrade for all new sessions.
