# Neuromail: AI-Powered Gmail Client
🚀 **Processity Hiring Task - Final Technical Report**

---

## 📋 Table of Contents
1. [EXECUTIVE SUMMARY](#1-executive-summary)
2. [PROJECT OVERVIEW](#2-project-overview)
3. [TECHNICAL ARCHITECTURE](#3-technical-architecture)
4. [AI CAPABILITIES](#4-ai-capabilities)
5. [MASTER REBUILD & VERIFICATION](#5-master-rebuild--verification)
6. [CODE STRUCTURE](#6-code-structure)
7. [API DOCUMENTATION](#7-api-documentation)
8. [DATABASE SCHEMA](#8-database-schema)
9. [PERFORMANCE & SECURITY](#9-performance--security)
10. [FUTURE ROADMAP](#10-future-roadmap)

---

## 1. EXECUTIVE SUMMARY
- **Project Name**: Neuromail
- **Version**: 1.0 (Prototype)
- **Purpose**: A next-generation, AI-first email client that transforms the inbox into an executable command center.
- **Prototype Level**: Built for the Processity hiring challenge to demonstrate advanced AI-UI integration.
- **Key Achievements**:
    - **Natural Language UI Control**: AI Copilot can execute 45+ UI operations.
    - **Hybrid AI Strategy**: Supports local LLMs (Ollama) and cloud GPUs (Colab Brain).
    - **Sandboxed Execution**: AI-generated workflows run in a secure, DOM-isolated sandbox.
- **Current Status**: **100% BUILD PASS**. All core and bonus features functional.

---

## 2. PROJECT OVERVIEW

### 2.1 Problem Statement
Modern email management is cognitively demanding. Users spend significant time navigating menus, searching for threads, and manually performing repetitive tasks.

### 2.2 Solution: The Intent Execution Layer
Neuromail introduces an **Intent Execution Layer** between the user and the Gmail API. Using natural language, users express "intent" (e.g., "star all unread emails from Sarah"), and the AI orchestrates the necessary sequence of UI actions and API calls.

### 2.3 Core Features
- ✅ **Gmail Sync**: Persistent thread and message management.
- ✅ **AI Orchestrator**: Multi-strategy reasoning engine.
- ✅ **UI Registry**: Metadata-driven operation system for AI discovery.
- ✅ **Sandboxed Runner**: Secure execution of AI-generated JS logic.
- ✅ **Dynamic Theme**: Persistent Dark/Light mode with brand color overrides.

---

## 3. TECHNICAL ARCHITECTURE

### 3.1 Frontend
- **Next.js 15 (Turbopack)**: Optimized for fast builds and React Server Components.
- **Zustand**: Unified state management for UI, Mail, and Settings.
- **Framer Motion**: Fluid animations for a premium dashboard feel.

### 3.2 Backend
- **NextAuth.js**: Secure OAuth 2.0 flow for Gmail API access.
- **Middleware**: Intent-based API routing with structured logging.
- **SQLite**: Local persistence for preferences and custom AI functions.

### 3.3 Infrastructure
- **Hybrid Compute**: Support for local Ollama or remote Colab-based LLM execution via Ngrok tunnels.

---

## 4. AI CAPABILITIES

### 4.1 UI Registry
A central registry (`src/agent/ui-registry/`) that exposes UI components as executable tools. This allows the AI to "discover" actions like `open_compose`, `navigate_sent`, or `apply_filter`.

### 4.2 Sandboxed Execution
AI-generated code snippets are executed in an isolated environment (`src/agent/execution-sandbox/`) where browser globals like `document` and `window` are poisoned, ensuring the AI can only interact via the provided SDK.

### 4.3 Intent Inference
A multi-stage fallback parser that handles LLM hallucinations. If the model fails to return structured JSON, the orchestrator uses semantic matching to infer the correct UI operation.

---

## 5. MASTER REBUILD & VERIFICATION

Post-initial development, a **Master Rebuild Phase** was executed to:
1. **Unify State**: Migrated fragmented UI states into a single synchronous `useUIStore`.
2. **Standardize Types**: Enforced strict TypeScript interfaces across the SDK and Orchestrator.
3. **Fix Build Errors**: Resolved all Next.js compilation issues, resulting in a **Clean Build (Pass)**.
4. **Tool Consolidation**: Merged legacy registries into a unified `agent/tools` architecture.

---

## 6. CODE STRUCTURE
```text
src/
├── app/                  # Next.js App Router (API & Pages)
├── agent/
│   ├── orchestrator/     # AI Reasoning Brain
│   ├── llm/              # Multi-Provider Factory (Ollama/Colab/OpenAI)
│   ├── execution-sandbox/# Secure code runner
│   ├── tools/            # SDK Tool Definitions
│   └── ui-registry/      # Frontend discovery layer
├── components/           # UI Components (Assistant, Mail, Layout)
├── store/                # Zustand State Stores
└── lib/                  # Gmail, Auth, and Storage utilities
```

---

## 7. API DOCUMENTATION
- **POST `/api/agent/chat`**: Main entry point for AI communication.
- **POST `/api/agent/execute`**: Executes sandboxed code on the server.
- **GET `/api/mail/threads`**: Synchronized Gmail thread access.
- **POST `/api/mail/send`**: Sends/Replies with thread threading support.

---

## 8. PERFORMANCE & SECURITY
- **Build**: Optimized with Next.js Turbopack.
- **Latency**: AI logic processed in <3s (Local) or <1s (Cloud).
- **Security**: OAuth 2.0 sessions, HTML sanitization (DOMPurify), and Sandboxed JS execution.

---

## 9. FUTURE ROADMAP
- 📅 **Mobile App**: Native iOS/Android builds.
- 🔗 **Multi-Account**: Support for multiple Gmail identities.
- 🧠 **Contextual Memory**: RAG-based search across historical email contexts.

---

## 10. CONCLUSION
Neuromail successfully demonstrates that a legacy interface like Email can be transformed into a high-productivity command center through a robust **Intent Execution Layer**.

Built with ❤️ for the Processity Hiring Challenge.
