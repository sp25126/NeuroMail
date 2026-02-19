# AI-Powered Mail App: Step-by-Step Roadmap & Prompt Guide

This document provides a technical roadmap for building a production-grade AI Email Client using Next.js 14, Gmail API, and AI Copilot patterns.

---

## Phase 0: Environment & Setup
**Goal:** Configure Google Cloud and local boilerplate.

1.  **GCP Setup:** Create a project, enable Gmail API and Pub/Sub.
2.  **Credentials:** Generate OAuth 2.0 Client IDs.
3.  **Local Init:** `npx create-next-app@latest ./` with Tailwind and App Router.

### Phase 0: Manual Verification
| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 1 | **GCP Project** | Project is active in Google Cloud Console. |
| 2 | **API Status** | Gmail API & Pub/Sub are marked as 'Enabled' in API Library. |
| 3 | **OAuth Scope** | OAuth consent screen shows 'gmail.modify' and 'gmail.send' as requested scopes. |
| 4 | **Localserver** | Running `npm run dev` displays the Next.js welcome page at `localhost:3000`. |
| 5 | **Environment** | `.env.local` contains valid IDs for `GOOGLE_CLIENT_ID` and `SECRET`. |
| 6 | **Terminal Check** | No linting or TypeScript errors on the initial boilerplate. |

---

## Phase 1: Authentication & Layout
**Goal:** Secure login and professional UI.

1.  **Auth:** Implement login/logout buttons and protected routes.
2.  **UI Shell:** Use Shadcn UI to build a 3-pane layout (Sidebar | Thread List | Thread Detail).
3.  **State:** Set up Zustand `useMailStore` for global UI state.

### Phase 1: Manual Verification
| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 1 | **Redirect Flow** | Clicking 'Sign In' takes user to the Google Account selection page. |
| 2 | **Session State** | After login, user's name and email are retrieved and shown in the UI. |
| 3 | **Layout Scroll** | The thread list (middle pane) scrolls while the sidebar and header remain fixed. |
| 4 | **Responsive UI** | Sidebar collapses or hides correctly on smaller screen widths. |
| 5 | **Store Update** | Clicking a folder in the sidebar updates the active folder state in the Zustand store. |
| 6 | **Logout** | Clicking 'Sign Out' clears the session and returns user to the landing page. |

---

## Phase 2: Gmail API Integration
**Goal:** Fetch and display real emails.

1.  **Client:** Create `lib/gmail.ts` using the Google APIs Node.js client.
2.  **API Routes:** 
    - `GET /api/mail/threads`: Returns list of threads with snippets.
    - `GET /api/mail/threads/[id]`: Returns detailed messages.
3.  **Execution:** Connect the UI to these API routes using `tanstack/react-query`.

### Phase 2: Manual Verification
| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 1 | **Data Fetch** | Thread list displays at least 20 real emails from the user's Gmail. |
| 2 | **Snippet Match** | The snippet text shown in the app matches the first few words of the email in Gmail. |
| 3 | **Detail Expansion** | Clicking a thread list item loads and displays all messages in that thread in the right pane. |
| 4 | **Sender Icons** | List items show either sender initials or profile pictures correctly. |
| 5 | **Loading State** | A skeleton or spinner appears while the Gmail API is fetching data. |
| 6 | **Error Handling** | Turning off Wi-Fi shows a graceful 'Connection Error' message instead of crashing. |

---

## Phase 3: Real-time Sync with Pub/Sub
**Goal:** Inbox updates without refreshing.

1.  **Topic:** Create a GCP Pub/Sub topic and grant Gmail permission to publish to it.
2.  **Webhook:** Create an API route `POST /api/webhook/gmail` to receive the push notification.
3.  **Push:** Call `gmail.users.watch()` to start the subscription.

### Phase 3: Manual Verification
| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 1 | **Subscription** | `watch()` API call returns a `200 OK` and a valid expiration timestamp in the logs. |
| 2 | **Webhook Reach** | Using a tool like Postman to hit `/api/webhook/gmail` returns a `200 Success`. |
| 3 | **Live Trigger** | Sending an email to the account from an external source triggers a log entry in the webhook. |
| 4 | **History Decode** | The historyId in the webhook payload is successfully decoded and logged. |
| 5 | **Auto-Refresh** | The thread list UI updates with the new message automatically (or via toast notification). |
| 6 | **Token Refresh** | The app successfully re-authenticates after the 1-hour OAuth access token expires. |

---

## Phase 4: AI Copilot & Action Patterns
**Goal:** Integrated AI assistant that can code/act.

1.  **Integration:** Set up the Copilot Chat UI.
2.  **Readables:** Use `useCopilotReadable` to sync the current thread content with the AI.
3.  **Actions:** Define `useCopilotAction` for "Search", "Summarize", and "Draft".
4.  **Confirmations:** Build the "Human-in-the-loop" modal for the "Send" action.

### Phase 4: Manual Verification
| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 1 | **Chat Greeting** | Opening the Copilot panel shows a welcome message and is ready for input. |
| 2 | **Context Sync** | Asking "What am I looking at?" results in the AI correctly identifying the open email. |
| 3 | **AI Action** | Asking "Summarize this thread" produces a concise, accurate summary. |
| 4 | **Draft Generation** | Asking "Draft a polite decline" generates a suitable response in the UI. |
| 5 | **Safety Modal** | Asking "Send this reply" triggers the User Confirmation modal rather than sending instantly. |
| 6 | **Cancellation** | Clicking 'Cancel' on the confirmation modal terminates the action and sends nothing. |

---

## Phase 5: Polish & Deployment
**Goal:** Vercel deployment and UX refinement.

1.  **Optimistic UI:** Star/Archive emails instantly in UI before API confirms.
2.  **Loading:** Add shimmering skeletons for data fetching.
3.  **Deploy:** Link to Vercel and set production ENV keys.

### Phase 5: Manual Verification
| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 1 | **Optimistic Star** | Clicking 'Star' changes the icon color immediately (before the server response). |
| 2 | **Deployment** | App is accessible via a public `.vercel.app` URL. |
| 3 | **Prod Auth** | Google OAuth works correctly in the production environment (Redirect URIs configured). |
| 4 | **Performance** | Page loads in under 2 seconds on a standard 4G connection. |
| 5 | **Clean Build** | `npm run build` completes with zero warnings or errors. |
| 6 | **Final UX** | No broken links or placeholder text are present in the final deployed interface. |

---
