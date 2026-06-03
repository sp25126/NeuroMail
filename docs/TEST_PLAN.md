# AI Mail App: Comprehensive Test Plan

## 1. Authentication & Session Management
1.  **[ Happy ]** **Google Login:** User can click "Sign in with Google" and redirect to Inbox upon success.
2.  **[ Edge ]** **Session Expiry:** Manually clear cookies and verify user is redirected to `/login` on refresh.
3.  **[ Edge ]** **Unauthorized Access:** Attempt to access `/mail` without a session; verify redirect to auth.
4.  **[ Happy ]** **Logout:** User can click "Sign Out" and session is effectively destroyed.

## 2. Thread List (Inbox) UI
5.  **[ Happy ]** **Initial Load:** Verify generic Skeletons appear before data loads.
6.  **[ Happy ]** **Data Population:** Verify thread subject, sender, and snippet render correctly.
7.  **[ Edge ]** **Empty Inbox:** Simulate 0 threads; verify "All caught up" empty state.
8.  **[ Edge ]** **API Failure:** Simulate 500 Generic Error; verify "Unable to fetch threads" error badge.
9.  **[ UI ]** **Selection State:** Click a thread; verify it highlights with "Neon" border and background.
10. **[ UI ]** **Hover Actions:** Hover over a thread; verify Archive/Trash icons appear (Desktop only).
11. **[ UI ]** **Mobile View:** Resize to mobile; verify Sidebar collapses into a Drawer/Menu.

## 3. Thread Detail & Reading
12. **[ Happy ]** **Email Rendering:** Open a complex HTML email; verify it renders within the safe `srcDoc` iframe.
13. **[ Edge ]** **XSS Protection:** Inject `<script>alert('xss')</script>` in mock data; verify script does NOT execute.
14. **[ UI ]** **Sticky Header:** Scroll down a long thread; verify "Command Center" header remains visible.
15. **[ UI ]** **Long Subject:** Test with a 200-char subject line; verify it truncates or wraps gracefully.
16. **[ Happy ]** **Floating Reply:** Verify the floating reply bar stays at the viewport bottom.

## 4. AI Copilot & Features
17. **[ Happy ]** **Summarization:** Click "AI Summary"; verify loading state -> summary accordion expands.
18. **[ Edge ]** **AI Failure:** Disconnect Internet/Ollama; verify "Summarization failed" error toast.
19. **[ Happy ]** **Context Awareness:** Open a thread, ask Copilot "What is this about?"; verify it answers based on *that* thread.
20. **[ Happy ]** **Drafting:** Ask Copilot "Write a reply accepting the offer"; verify it places text in the composer.
21. **[ Edge ]** **Token Limit:** Feed a 10,000-word email to AI; verify it handles truncation gracefully (doesn't crash).
22. **[ Happy ]** **Provider Switching:** Toggle `OPENROUTER_API_KEY` in env; verify Sidebar badge updates ("Local Ollama" <-> "OpenRouter").

## 5. User Preferences & Persistence (SQLite)
23. **[ Happy ]** **Persona Save:** Change Persona to "Casual"; reload page; verify "Casual" is still selected (DB Sync).
24. **[ Happy ]** **Style Profile:** Update "Tone" to "Witty"; verify immediate optimistic UI update.
25. **[ Edge ]** **Database Offline:** Stop SQLite write permissions; verify UI reverts optimistically (or shows error toast).

## 6. Infrastructure & Deployment
26. **[ Happy ]** **Environment Validation:** Run `npm run build` without `.env`; verify script fails with clear missing var errors.
27. **[ Happy ]** **Production Build:** Verify `npm run build` produces a valid `.next` folder without lint errors.

## 7. Performance & Accessibility
29. **[ Perf ]** **List Scrolling:** Rapidly scroll 100+ threads; verify 60fps (virtualization check).
30. **[ A11y ]** **Keyboard Nav:** Use `Tab` to navigate from Thread List to Detail View Actions; verify focus rings.
