CREATE TABLE IF NOT EXISTS user_preferences (
    id TEXT PRIMARY KEY,
    user_id TEXT UNIQUE NOT NULL,
    llm_provider TEXT DEFAULT 'ollama',
    llm_model TEXT DEFAULT 'gemma2:2b',
    llm_api_key TEXT,
    llm_temperature REAL DEFAULT 0.7,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS composed_functions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    definition TEXT NOT NULL,
    usage_count INTEGER DEFAULT 0,
    success_rate REAL DEFAULT 1.0,
    avg_execution_time_ms REAL DEFAULT 0.0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS macros (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    definition TEXT NOT NULL,
    usage_count INTEGER DEFAULT 0,
    last_used_at TEXT,
    created_at TEXT NOT NULL,
    deleted_at TEXT DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS drafts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    to_address TEXT,
    subject TEXT,
    body TEXT,
    thread_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(user_id, thread_id)
);

CREATE TABLE IF NOT EXISTS ai_operation_logs (
    id TEXT PRIMARY KEY,
    operation_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    arguments TEXT NOT NULL,
    result TEXT,
    success INTEGER NOT NULL,
    error TEXT,
    execution_time_ms INTEGER NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_memory (
    user_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_value TEXT NOT NULL,
    context TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    usage_count INTEGER DEFAULT 1,
    PRIMARY KEY (user_id, entity_type, entity_value)
);

CREATE TABLE IF NOT EXISTS conversation_history (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    tool_calls TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tool_execution_logs (
    id TEXT PRIMARY KEY,
    operation_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    arguments TEXT NOT NULL,
    result TEXT,
    success INTEGER NOT NULL,
    error TEXT,
    execution_time_ms INTEGER NOT NULL,
    created_at TEXT NOT NULL
);
