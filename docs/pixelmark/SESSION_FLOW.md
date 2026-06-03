# PixelMark Session Flow & Polish (7E)

This document outlines the refined flow from project creation to feedback export.

## 1. Onboarding & Creation
- **Loading State:** Use a skeletal preview of a browser shell when a session is initializing.
- **Empty State:** If a project has no sessions, show a "First Impression" call-to-action with a large "+" button and a link to documentation on "How to Review".

## 2. Review Phase
- **Loading Content:** While the proxy is fetching the target site, show a progress bar indicating "Bypassing CORS..." and "Injecting Agent...".
- **Interaction Feedback:** 
    - When a marker is saved, show a "Marker Captured" toast with a "View All" link.
    - If a capture fails, offer a "Try Basic Capture" button immediately.

## 3. Sharing & Collaboration
- **Link Flow:** The "Share" button should immediately copy a short-link to the clipboard and show a success animation.
- **Public View:** Ensure the public view has a "Read Only" mode clearly marked, with an optional "Request Access to Comment" button.

## 4. Export & Hand-off
- **Export Actions:**
    - "Export to PDF": A clean, paginated report of all markers with screenshots.
    - "Sync to Jira/GitHub": One-click integration for developers.
- **Completion State:** Once all markers are addressed, show a "Review Complete" celebrate state (confetti) for the session.

## 5. Failure States
- **Friendly Errors:** Instead of "404 Not Found", use "We couldn't reach that site. Check the URL or try another one."
- **Proxy Blocked:** If a site explicitly blocks proxying (e.g., via CSP), explain *why* it happened and suggest the "Local Agent" browser extension.
