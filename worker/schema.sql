CREATE TABLE IF NOT EXISTS submissions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at     TEXT    NOT NULL,
  name           TEXT    NOT NULL DEFAULT '',
  email          TEXT    NOT NULL DEFAULT '',
  phone          TEXT    NOT NULL DEFAULT '',
  kind           TEXT    NOT NULL DEFAULT '',
  details        TEXT    NOT NULL DEFAULT '',
  ip             TEXT    NOT NULL DEFAULT '',
  user_agent     TEXT    NOT NULL DEFAULT '',
  origin         TEXT    NOT NULL DEFAULT '',
  status         TEXT    NOT NULL DEFAULT 'new',      -- new | spam
  spam_reason    TEXT    NOT NULL DEFAULT '',
  email_status   TEXT    NOT NULL DEFAULT 'pending',  -- pending | sent | failed
  email_error    TEXT    NOT NULL DEFAULT '',
  email_attempts INTEGER NOT NULL DEFAULT 0,
  emailed_at     TEXT
);
CREATE INDEX IF NOT EXISTS submissions_created ON submissions (created_at DESC);
CREATE INDEX IF NOT EXISTS submissions_ip_created ON submissions (ip, created_at);
