-- The demo's Database page keeps its notes here (SQLite). som dev runs this once, by itself.
CREATE TABLE notes (
  id INTEGER PRIMARY KEY,
  title VARCHAR(120) NOT NULL,
  body TEXT,
  color VARCHAR(20) NOT NULL DEFAULT 'yellow',
  pinned BOOLEAN NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX notes_title_unique ON notes (title);
INSERT INTO notes (title, body, color, pinned) VALUES
  ('Welcome', 'These notes live in a real SQLite database: demo/database/demo.db', 'yellow', 1),
  ('Try it', 'Add, edit, pin and delete notes. Reload: they are still here.', 'blue', 0),
  ('Same API', 'GET, POST, PUT, PATCH and DELETE on /api/notes, made from the table.', 'green', 0);
