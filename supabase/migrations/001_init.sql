-- ─── Users ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id            BIGSERIAL PRIMARY KEY,
  telegram_id   BIGINT    UNIQUE NOT NULL,
  username      TEXT,
  first_name    TEXT,
  country_codes TEXT[]    NOT NULL DEFAULT '{}',
  categories    TEXT[]    NOT NULL DEFAULT '{}',
  is_active     BOOLEAN   NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS users_telegram_id_idx ON users (telegram_id);

-- ─── Article cache ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS articles (
  id              BIGSERIAL PRIMARY KEY,
  world_news_id   INTEGER   UNIQUE NOT NULL,
  adapted_title   TEXT      NOT NULL,
  adapted_summary TEXT      NOT NULL,
  adapted_body    TEXT      NOT NULL,
  country_code    TEXT      NOT NULL,
  category        TEXT      NOT NULL,
  source_url      TEXT      NOT NULL,
  image_url       TEXT,
  published_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS articles_world_news_id_idx ON articles (world_news_id);
CREATE INDEX IF NOT EXISTS articles_country_category_idx ON articles (country_code, category);
CREATE INDEX IF NOT EXISTS articles_created_at_idx ON articles (created_at);

-- ─── Subscriptions ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS subscriptions (
  id          BIGSERIAL PRIMARY KEY,
  telegram_id BIGINT    UNIQUE NOT NULL REFERENCES users (telegram_id) ON DELETE CASCADE,
  hour        SMALLINT  NOT NULL CHECK (hour BETWEEN 0 AND 23),
  minute      SMALLINT  NOT NULL CHECK (minute BETWEEN 0 AND 59),
  is_active   BOOLEAN   NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Row-level security (enable but allow service role full access) ────────────

ALTER TABLE users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE articles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS automatically — no additional policies needed
-- for a bot-only backend.

-- ─── Auto-update updated_at ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
