# PixelMark UX & Hierarchy Guidelines

## 1. Unified Review Experience (7B)

To ensure a coherent flow across all rendering modes (DOM, Heavy, Fallback):

### Identity Consistency
- The **Command Center** must remain identical in visual style regardless of the mode.
- Use the same iconography for "Create Marker" and "Navigate".

### Transition Behavior
- When switching to Heavy Mode, use a subtle "Optimizing for High Fidelity" overlay rather than a blank loading screen.
- If falling back to Partial Render, show a persistent but non-intrusive toast: *"Some 3D elements may be simplified in this view."*

### Functional Parity
- **Marker Creation:** The click-to-mark interaction must feel identical. In Heavy mode, we map click coordinates to the underlying WebGL context; in DOM mode, to the element tree. The user should not see this difference.
- **Keyboard Shortcuts:** `M` for Marker, `V` for View, `Esc` to cancel. These must work universally.

---

## 2. Information Hierarchy (7C)

The interface should prioritize the reviewed content while keeping controls accessible.

### Hierarchy Rules
1. **Primary (The Stage):** The reviewed site (Iframe). It should occupy >90% of the viewport. Shadows should differentiate the site from the PixelMark shell.
2. **Secondary (Action):** Marker creation tools. Floating action buttons or a docked bottom bar.
3. **Tertiary (Metadata):** Project name, session ID, and device info. These should be tucked away in a collapsible "Info" panel or the top bar.

### Visual Emphasis
- **Active State:** When creating a marker, dim the surrounding site slightly (0.2 opacity overlay) to focus on the selection.
- **Heavy Mode Indicator:** A small high-fidelity icon (sparkle) in the status bar indicates Heavy Render is active.
- **Fallback State:** Use a "Basic View" label next to the URL if the system is in fallback mode.

### Simplification Notes
- Remove all non-essential borders.
- Use "Ghost" buttons for tertiary actions.
- Hide session metadata by default; reveal on hover or click of the project name.
