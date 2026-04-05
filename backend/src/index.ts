import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import Database from 'better-sqlite3';

const app = express();
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Database setup
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '..', 'wiki.db');
const UPLOADS_PATH = process.env.UPLOADS_PATH || path.join(__dirname, '..', 'uploads');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_PATH)) {
  fs.mkdirSync(UPLOADS_PATH, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Strip HTML tags and decode common entities to plain text
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// Build a safe FTS5 MATCH expression from user input
function buildFtsQuery(q: string): string {
  const words = q.replace(/["'*^(){}[\]|\\]/g, ' ').trim().split(/\s+/).filter(Boolean);
  return words.map((w) => `${w}*`).join(' ');
}

// Initialize database schema
db.exec(`
  CREATE TABLE IF NOT EXISTS pages (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT 'Untitled',
    content TEXT NOT NULL DEFAULT '',
    parent_id TEXT REFERENCES pages(id) ON DELETE SET NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS page_versions (
    id TEXT PRIMARY KEY,
    page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    saved_at TEXT NOT NULL,
    version_number INTEGER NOT NULL
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(
    page_id UNINDEXED,
    title,
    body,
    tokenize='unicode61'
  );
`);

// Rebuild the FTS index from the pages table on every startup
{
  const ftsInsert = db.prepare('INSERT INTO pages_fts(page_id, title, body) VALUES (?, ?, ?)');
  const allPages = db.prepare('SELECT id, title, content FROM pages').all() as { id: string; title: string; content: string }[];
  db.transaction(() => {
    db.exec('DELETE FROM pages_fts');
    for (const p of allPages) {
      ftsInsert.run(p.id, p.title, stripHtml(p.content));
    }
  })();
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files
app.use('/uploads', express.static(UPLOADS_PATH));

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_PATH);
  },
  filename: (_req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (_req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

// Helper: save a version snapshot before overwriting page content
function saveVersion(pageId: string, title: string, content: string) {
  const id = uuidv4();
  const now = new Date().toISOString();
  const row = db.prepare('SELECT COALESCE(MAX(version_number), 0) AS max_v FROM page_versions WHERE page_id = ?').get(pageId) as { max_v: number };
  const versionNumber = row.max_v + 1;

  db.prepare('INSERT INTO page_versions (id, page_id, title, content, saved_at, version_number) VALUES (?, ?, ?, ?, ?, ?)').run(id, pageId, title, content, now, versionNumber);

  // Keep at most 50 versions per page
  const old = db.prepare('SELECT id FROM page_versions WHERE page_id = ? ORDER BY version_number DESC LIMIT -1 OFFSET 50').all(pageId) as { id: string }[];
  if (old.length > 0) {
    const del = db.prepare('DELETE FROM page_versions WHERE id = ?');
    db.transaction(() => { for (const v of old) del.run(v.id); })();
  }
}

// Helper: keep FTS index in sync
function ftsUpdate(pageId: string, title: string, content: string) {
  db.prepare('DELETE FROM pages_fts WHERE page_id = ?').run(pageId);
  db.prepare('INSERT INTO pages_fts(page_id, title, body) VALUES (?, ?, ?)').run(pageId, title, stripHtml(content));
}

function ftsDelete(pageId: string) {
  db.prepare('DELETE FROM pages_fts WHERE page_id = ?').run(pageId);
}

// Helper: get all descendant IDs for a page
function getDescendantIds(pageId: string): string[] {
  const children = db.prepare('SELECT id FROM pages WHERE parent_id = ?').all(pageId) as { id: string }[];
  const ids: string[] = [];
  for (const child of children) {
    ids.push(child.id);
    ids.push(...getDescendantIds(child.id));
  }
  return ids;
}

// ─── API Routes ───────────────────────────────────────────────────────────────

// GET /api/pages - returns all pages without content (for sidebar tree)
app.get('/api/pages', (_req: Request, res: Response) => {
  try {
    const pages = db
      .prepare(
        'SELECT id, title, parent_id, position, created_at, updated_at FROM pages ORDER BY position ASC, created_at ASC'
      )
      .all();
    res.json(pages);
  } catch (err) {
    console.error('Error fetching pages:', err);
    res.status(500).json({ error: 'Failed to fetch pages' });
  }
});

// GET /api/pages/:id - returns single page with content
app.get('/api/pages/:id', (req: Request, res: Response) => {
  try {
    const page = db.prepare('SELECT * FROM pages WHERE id = ?').get(req.params.id);
    if (!page) {
      return res.status(404).json({ error: 'Page not found' });
    }
    res.json(page);
  } catch (err) {
    console.error('Error fetching page:', err);
    res.status(500).json({ error: 'Failed to fetch page' });
  }
});

// POST /api/pages - create a new page
app.post('/api/pages', (req: Request, res: Response) => {
  try {
    const { title = 'Untitled', content = '', parent_id = null } = req.body;
    const id = uuidv4();
    const now = new Date().toISOString();

    // Get max position for siblings
    const maxPositionRow = db
      .prepare(
        'SELECT COALESCE(MAX(position), -1) as max_pos FROM pages WHERE parent_id IS ?'
      )
      .get(parent_id) as { max_pos: number };
    const position = maxPositionRow.max_pos + 1;

    db.prepare(
      'INSERT INTO pages (id, title, content, parent_id, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, title, content, parent_id, position, now, now);

    const page = db.prepare('SELECT * FROM pages WHERE id = ?').get(id);
    ftsUpdate(id, title, content);
    res.status(201).json(page);
  } catch (err) {
    console.error('Error creating page:', err);
    res.status(500).json({ error: 'Failed to create page' });
  }
});

// PUT /api/pages/:id - update a page
app.put('/api/pages/:id', (req: Request, res: Response) => {
  try {
    const { title, content, parent_id, position } = req.body;
    const now = new Date().toISOString();

    const existing = db.prepare('SELECT * FROM pages WHERE id = ?').get(req.params.id) as {
      id: string;
      title: string;
      content: string;
      parent_id: string | null;
      position: number;
    } | undefined;

    if (!existing) {
      return res.status(404).json({ error: 'Page not found' });
    }

    const newTitle = title !== undefined ? title : existing.title;
    const newContent = content !== undefined ? content : existing.content;
    const newParentId = parent_id !== undefined ? parent_id : existing.parent_id;
    const newPosition = position !== undefined ? position : existing.position;

    // Save a version snapshot when title or content actually changes,
    // but skip the very first save of a new page (still at default state)
    const isNewPage = existing.title === 'Untitled' && existing.content === '';
    if (!isNewPage && ((title !== undefined && title !== existing.title) || (content !== undefined && content !== existing.content))) {
      saveVersion(req.params.id, existing.title, existing.content);
    }

    // Guard: prevent circular reference (moving a page under its own descendant)
    if (newParentId && newParentId !== existing.parent_id) {
      const descendants = getDescendantIds(req.params.id);
      if (newParentId === req.params.id || descendants.includes(newParentId)) {
        return res.status(400).json({ error: 'Cannot move a page under its own descendant' });
      }
    }

    db.prepare(
      'UPDATE pages SET title = ?, content = ?, parent_id = ?, position = ?, updated_at = ? WHERE id = ?'
    ).run(newTitle, newContent, newParentId, newPosition, now, req.params.id);

    const page = db.prepare('SELECT * FROM pages WHERE id = ?').get(req.params.id);
    ftsUpdate(req.params.id, newTitle, newContent);
    res.json(page);
  } catch (err) {
    console.error('Error updating page:', err);
    res.status(500).json({ error: 'Failed to update page' });
  }
});

// DELETE /api/pages/:id - delete page and all descendants
app.delete('/api/pages/:id', (req: Request, res: Response) => {
  try {
    const page = db.prepare('SELECT id FROM pages WHERE id = ?').get(req.params.id);
    if (!page) {
      return res.status(404).json({ error: 'Page not found' });
    }

    const descendantIds = getDescendantIds(req.params.id);
    const allIds = [req.params.id, ...descendantIds];

    const deleteStmt = db.prepare('DELETE FROM pages WHERE id = ?');
    const deleteMany = db.transaction((ids: string[]) => {
      for (const id of ids) {
        deleteStmt.run(id);
      }
    });
    deleteMany(allIds);
    for (const id of allIds) ftsDelete(id);

    res.json({ success: true, deleted: allIds.length });
  } catch (err) {
    console.error('Error deleting page:', err);
    res.status(500).json({ error: 'Failed to delete page' });
  }
});

// GET /api/pages/:id/versions - list all versions for a page
app.get('/api/pages/:id/versions', (req: Request, res: Response) => {
  try {
    const page = db.prepare('SELECT id FROM pages WHERE id = ?').get(req.params.id);
    if (!page) return res.status(404).json({ error: 'Page not found' });

    const versions = db
      .prepare('SELECT id, title, saved_at, version_number FROM page_versions WHERE page_id = ? ORDER BY version_number DESC')
      .all(req.params.id);
    res.json(versions);
  } catch (err) {
    console.error('Error fetching versions:', err);
    res.status(500).json({ error: 'Failed to fetch versions' });
  }
});

// GET /api/pages/:id/versions/:versionId - get a specific version with content
app.get('/api/pages/:id/versions/:versionId', (req: Request, res: Response) => {
  try {
    const version = db
      .prepare('SELECT * FROM page_versions WHERE id = ? AND page_id = ?')
      .get(req.params.versionId, req.params.id);
    if (!version) return res.status(404).json({ error: 'Version not found' });
    res.json(version);
  } catch (err) {
    console.error('Error fetching version:', err);
    res.status(500).json({ error: 'Failed to fetch version' });
  }
});

// POST /api/pages/:id/restore/:versionId - restore a page to a previous version
app.post('/api/pages/:id/restore/:versionId', (req: Request, res: Response) => {
  try {
    const existing = db.prepare('SELECT * FROM pages WHERE id = ?').get(req.params.id) as {
      id: string; title: string; content: string;
    } | undefined;
    if (!existing) return res.status(404).json({ error: 'Page not found' });

    const version = db
      .prepare('SELECT * FROM page_versions WHERE id = ? AND page_id = ?')
      .get(req.params.versionId, req.params.id) as {
        id: string; title: string; content: string;
      } | undefined;
    if (!version) return res.status(404).json({ error: 'Version not found' });

    // Save current state before overwriting
    saveVersion(req.params.id, existing.title, existing.content);

    const now = new Date().toISOString();
    db.prepare('UPDATE pages SET title = ?, content = ?, updated_at = ? WHERE id = ?').run(version.title, version.content, now, req.params.id);
    ftsUpdate(req.params.id, version.title, version.content);

    const page = db.prepare('SELECT * FROM pages WHERE id = ?').get(req.params.id);
    res.json(page);
  } catch (err) {
    console.error('Error restoring version:', err);
    res.status(500).json({ error: 'Failed to restore version' });
  }
});

// GET /api/pages/:id/backlinks - pages that link to this page
app.get('/api/pages/:id/backlinks', (req: Request, res: Response) => {
  try {
    const page = db.prepare('SELECT id FROM pages WHERE id = ?').get(req.params.id);
    if (!page) return res.status(404).json({ error: 'Page not found' });

    const backlinks = db
      .prepare(`SELECT id, title FROM pages WHERE content LIKE ? AND id != ?`)
      .all(`%data-page-id="${req.params.id}"%`, req.params.id);
    res.json(backlinks);
  } catch (err) {
    console.error('Error fetching backlinks:', err);
    res.status(500).json({ error: 'Failed to fetch backlinks' });
  }
});

// GET /api/search?q=query - full text search via FTS5
app.get('/api/search', (req: Request, res: Response) => {
  try {
    const q = (req.query.q as string || '').trim();
    if (!q) return res.json([]);

    const ftsQ = buildFtsQuery(q);
    if (!ftsQ) return res.json([]);

    const results = db
      .prepare(
        `SELECT page_id AS id, title,
           snippet(pages_fts, 2, '', '', '...', 30) AS snippet
         FROM pages_fts
         WHERE pages_fts MATCH ?
         ORDER BY rank
         LIMIT 20`
      )
      .all(ftsQ) as { id: string; title: string; snippet: string }[];

    res.json(results);
  } catch (err) {
    console.error('Error searching:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

// POST /api/upload - upload an image
app.post('/api/upload', upload.single('file'), (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const url = `/uploads/${req.file.filename}`;
    res.json({ url });
  } catch (err) {
    console.error('Error uploading file:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// In production, serve the frontend
if (NODE_ENV === 'production') {
  const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
  if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(frontendDist, 'index.html'));
    });
  }
}

// Error handling middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`MyInfraWiki backend running on port ${PORT} (${NODE_ENV})`);
  console.log(`Database: ${DB_PATH}`);
  console.log(`Uploads: ${UPLOADS_PATH}`);
});

export default app;
