CREATE TABLE IF NOT EXISTS parsed_email_records (
    id TEXT PRIMARY KEY,
    raw_email_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    parsed_json TEXT, -- JSON fields parsed from email
    status TEXT CHECK(status IN ('parsed_ok', 'validation_failed', 'unmatched')) NOT NULL,
    validation_errors TEXT, -- JSON error strings or null
    reviewed_at TEXT,
    reviewed_by TEXT,
    review_action TEXT CHECK(review_action IN ('APPROVED', 'REJECTED')),
    created_at TEXT NOT NULL,
    FOREIGN KEY(raw_email_id) REFERENCES raw_emails(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_parsed_emails_tenant ON parsed_email_records(tenant_id, status);

CREATE TABLE IF NOT EXISTS freight_templates (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    carrier TEXT NOT NULL,
    email_type TEXT NOT NULL,
    subject_pattern TEXT NOT NULL,
    body_rules_json TEXT NOT NULL, -- JSON array of extraction rules
    active INTEGER DEFAULT 1,
    sample_test_payloads TEXT, -- JSON array of test cases
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_templates_tenant ON freight_templates(tenant_id, active);
