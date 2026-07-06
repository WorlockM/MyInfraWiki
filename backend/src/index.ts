import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import Database from 'better-sqlite3';
import archiver from 'archiver';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

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

// Delete uploaded files that are no longer referenced in any page content
// or any version snapshot. Files younger than the grace period are always
// kept: an upload that is still being edited into a page has no reference yet.
const UPLOAD_GRACE_MS = 24 * 60 * 60 * 1000;

function cleanupOrphanedUploads() {
  try {
    const files = fs.readdirSync(UPLOADS_PATH);
    if (files.length === 0) return;

    const pages = db.prepare('SELECT content FROM pages').all() as { content: string }[];
    const versions = db.prepare('SELECT content FROM page_versions').all() as { content: string }[];
    const allContent = pages
      .map((p) => p.content)
      .concat(versions.map((v) => v.content))
      .join(' ');

    const now = Date.now();
    for (const file of files) {
      if (allContent.includes(`/uploads/${file}`)) continue;

      const filePath = path.join(UPLOADS_PATH, file);
      try {
        if (now - fs.statSync(filePath).mtimeMs < UPLOAD_GRACE_MS) continue;
      } catch {
        continue;
      }
      fs.unlink(filePath, (err) => {
        if (err) console.error(`Failed to delete orphaned upload ${file}:`, err);
      });
    }
  } catch (err) {
    console.error('Error during upload cleanup:', err);
  }
}

// Build a safe FTS5 MATCH expression from user input. Each word is wrapped
// in double quotes so tokens with punctuation (10.0.5.32, e-mail, srv-prod-01)
// are treated as phrases instead of causing FTS5 syntax errors.
function buildFtsQuery(q: string): string {
  const words = q.replace(/["'*^(){}[\]|\\]/g, ' ').trim().split(/\s+/).filter(Boolean);
  return words.map((w) => `"${w}"*`).join(' ');
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

// Seed demo content if the database is empty
{
  const count = (db.prepare('SELECT COUNT(*) as c FROM pages').get() as { c: number }).c;
  if (count === 0) {
    const now = new Date().toISOString();
    const id1 = uuidv4();
    const id2 = uuidv4();
    const id3 = uuidv4();

    db.prepare('INSERT INTO pages (id, title, content, parent_id, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      id1,
      'Welcome to MyInfraWiki',
      `<h2>What is MyInfraWiki?</h2><p>MyInfraWiki is a self-hosted wiki for documenting your infrastructure. Write pages using the rich-text editor, organise them in a hierarchy, and find anything instantly with full-text search.</p><h2>Getting started</h2><ul><li><p>Click <strong>Edit</strong> (or press <kbd>Ctrl+E</kbd> / <kbd>Cmd+E</kbd>) to start editing any page.</p></li><li><p>Use the <strong>+</strong> button in the sidebar to create a new page.</p></li><li><p>Drag pages in the sidebar to reorganise them.</p></li><li><p>Use the search bar at the top of the sidebar to find pages.</p></li></ul><h2>Features</h2><ul><li><p>Rich-text editor with headings, lists, tables, code blocks and more</p></li><li><p>Syntax highlighting for 190+ languages</p></li><li><p>Mermaid diagrams inside code blocks</p></li><li><p>Page history with word-level diff and version restore</p></li><li><p>Backlinks — see which pages link to this one</p></li><li><p>Dark mode, defaulting to your system preference</p></li><li><p>PDF export</p></li></ul>`,
      null, 0, now, now
    );

    db.prepare('INSERT INTO pages (id, title, content, parent_id, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      id2,
      'Markdown & Formatting',
      `<h2>Text formatting</h2><p>The toolbar gives you access to <strong>bold</strong>, <em>italic</em>, <u>underline</u>, and <mark>highlight</mark>. You can also use keyboard shortcuts like <kbd>Ctrl+B</kbd> for bold.</p><h2>Code blocks</h2><p>Insert a code block and select the language from the dropdown in the header. Line numbers and a copy button are included automatically.</p><pre><code class="language-bash"># Pull the latest image and restart the container
export IMAGE="ghcr.io/worlockm/myinfrawiki:latest"

docker pull "$IMAGE"
docker compose up -d --force-recreate</code></pre><p>Or with Python:</p><pre><code class="language-python">import requests

# Fetch all pages from the API
response = requests.get("http://localhost:3000/api/pages")
pages = response.json()

for page in pages:
    print(f"{page['title']} — last updated: {page['updated_at']}")</code></pre><h2>Mermaid diagrams</h2><p>Set the language to <strong>Mermaid diagram</strong> to render diagrams:</p><pre><code class="language-mermaid">flowchart LR
    A[Browser] --> B[MyInfraWiki]
    B --> C[(SQLite)]</code></pre><h2>Callouts</h2><div data-type="callout" data-callout-type="info"><p>This is an info callout. Use it to highlight important information.</p></div><div data-type="callout" data-callout-type="warning"><p>This is a warning callout.</p></div><div data-type="callout" data-callout-type="error"><p>This is an error callout.</p></div>`,
      id1, 0, now, now
    );

    db.prepare('INSERT INTO pages (id, title, content, parent_id, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      id3,
      'Example: Server Documentation',
      `<h2>Server overview</h2><table><tbody><tr><th>Property</th><th>Value</th></tr><tr><td>Hostname</td><td>srv-prod-01</td></tr><tr><td>IP address</td><td>10.0.1.10</td></tr><tr><td>OS</td><td>Ubuntu 24.04 LTS</td></tr><tr><td>Role</td><td>Application server</td></tr><tr><td>CPU</td><td>4 vCPU</td></tr><tr><td>RAM</td><td>8 GB</td></tr></tbody></table><h2>Installed services</h2><ul><li><p>Docker 26.x</p></li><li><p>Nginx (reverse proxy)</p></li><li><p>Node Exporter (Prometheus metrics)</p></li></ul><h2>Network diagram</h2><pre><code class="language-mermaid">flowchart TD
    Internet --> FW{Firewall}
    FW -->|443| LB[Nginx]
    LB --> App[srv-prod-01]
    App --> DB[(PostgreSQL)]</code></pre><h2>Maintenance notes</h2><div data-type="callout" data-callout-type="warning"><p>Always create a snapshot before performing OS upgrades.</p></div>`,
      id1, 1, now, now
    );
  }
}

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
// CORS is only needed in development, where the Vite dev server proxies from
// another port. In production the backend serves the frontend same-origin,
// and an open CORS policy would let any website read and modify the wiki.
if (NODE_ENV !== 'production') {
  app.use(cors());
}
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files. nosniff + attachment keep uploads inert: a crafted
// SVG or HTML file downloads instead of executing scripts same-origin.
// <img> tags render images regardless of Content-Disposition.
app.use(
  '/uploads',
  express.static(UPLOADS_PATH, {
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Disposition', 'attachment');
    },
  })
);

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_PATH);
  },
  filename: (_req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname).toLowerCase()}`;
    cb(null, uniqueName);
  },
});

// The client controls both the MIME type and the filename, so uploads are
// validated on the stored extension (which determines how the file is later
// served) rather than on the MIME type alone.
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
const ATTACHMENT_EXTENSIONS = [
  ...IMAGE_EXTENSIONS,
  '.pdf', '.txt', '.md', '.log', '.conf', '.cfg', '.ini', '.example',
  '.json', '.yaml', '.yml', '.toml', '.xml', '.csv', '.tsv',
  '.zip', '.gz', '.tgz', '.tar', '.7z',
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.pem', '.crt', '.pub', '.sql', '.ps1', '.sh', '.bak',
];

function extensionFilter(allowed: string[]): multer.Options['fileFilter'] {
  return (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type "${ext || 'none'}" is not allowed`));
    }
  };
}

const uploadImage = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: extensionFilter(IMAGE_EXTENSIONS),
});

// Attachments keep a readable filename so downloads aren't just a UUID.
// The sanitised charset is URL-safe, the random prefix prevents collisions.
const attachmentStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_PATH);
  },
  filename: (_req, file, cb) => {
    // Multer decodes the original filename as latin1; restore UTF-8 first
    const original = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const base = path
      .basename(original)
      .replace(/[^A-Za-z0-9._-]+/g, '_')
      .slice(-80)
      .toLowerCase();
    cb(null, `${uuidv4().slice(0, 8)}_${base}`);
  },
});

const uploadAttachment = multer({
  storage: attachmentStorage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB limit
  fileFilter: extensionFilter(ATTACHMENT_EXTENSIONS),
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

// PUT /api/pages/reorder - set sibling order in one atomic call.
// Registered before /api/pages/:id so "reorder" is not matched as a page id.
// updated_at is intentionally left untouched: moving a page around is not a
// content change and must not trigger edit-conflict detection.
app.put('/api/pages/reorder', (req: Request, res: Response) => {
  try {
    const { ordered_ids } = req.body as { ordered_ids?: unknown };
    if (!Array.isArray(ordered_ids) || ordered_ids.some((id) => typeof id !== 'string')) {
      return res.status(400).json({ error: 'ordered_ids must be an array of page ids' });
    }

    const stmt = db.prepare('UPDATE pages SET position = ? WHERE id = ?');
    db.transaction(() => {
      (ordered_ids as string[]).forEach((id, index) => stmt.run(index, id));
    })();

    res.json({ success: true });
  } catch (err) {
    console.error('Error reordering pages:', err);
    res.status(500).json({ error: 'Failed to reorder pages' });
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
      updated_at: string;
    } | undefined;

    if (!existing) {
      return res.status(404).json({ error: 'Page not found' });
    }

    // Detect concurrent edit conflict
    const { last_known_updated_at } = req.body;
    if (last_known_updated_at !== undefined && existing.updated_at !== last_known_updated_at) {
      return res.status(409).json({ error: 'conflict', server_updated_at: existing.updated_at });
    }

    const newTitle = title !== undefined ? title : existing.title;
    const newContent = content !== undefined ? content : existing.content;
    const newParentId = parent_id !== undefined ? parent_id : existing.parent_id;
    const newPosition = position !== undefined ? position : existing.position;

    // Guard: prevent circular reference (moving a page under its own descendant)
    if (newParentId && newParentId !== existing.parent_id) {
      const descendants = getDescendantIds(req.params.id);
      if (newParentId === req.params.id || descendants.includes(newParentId)) {
        return res.status(400).json({ error: 'Cannot move a page under its own descendant' });
      }
    }

    // Only a real title/content change counts as an edit: it triggers a
    // version snapshot and bumps updated_at. Moving a page (parent_id or
    // position) leaves updated_at alone so it doesn't trigger edit-conflict
    // detection or pollute the "recently updated" list.
    const isEdited =
      (title !== undefined && title !== existing.title) ||
      (content !== undefined && content !== existing.content);
    const isNewPage = existing.title === 'Untitled' && existing.content === '';
    const shouldSnapshot = !isNewPage && isEdited;
    const newUpdatedAt = isEdited ? now : existing.updated_at;

    db.transaction(() => {
      if (shouldSnapshot) {
        saveVersion(req.params.id, existing.title, existing.content);
      }
      db.prepare(
        'UPDATE pages SET title = ?, content = ?, parent_id = ?, position = ?, updated_at = ? WHERE id = ?'
      ).run(newTitle, newContent, newParentId, newPosition, newUpdatedAt, req.params.id);
      ftsUpdate(req.params.id, newTitle, newContent);
    })();

    const page = db.prepare('SELECT * FROM pages WHERE id = ?').get(req.params.id);
    setImmediate(cleanupOrphanedUploads);
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
    setImmediate(cleanupOrphanedUploads);

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

    // Escape LIKE wildcards; the id comes from the URL and is not guaranteed
    // to be a well-formed uuid
    const idEscaped = req.params.id.replace(/[\\%_]/g, (c) => `\\${c}`);
    const backlinks = db
      .prepare(`SELECT id, title FROM pages WHERE content LIKE ? ESCAPE '\\' AND id != ?`)
      .all(`%data-page-id="${idEscaped}"%`, req.params.id);
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
app.post('/api/upload', uploadImage.single('file'), (req: Request, res: Response) => {
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

// POST /api/upload-attachment - upload a non-image attachment
app.post('/api/upload-attachment', uploadAttachment.single('file'), (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    // Multer decodes the original filename as latin1; restore UTF-8
    const name = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    const url = `/uploads/${req.file.filename}`;
    res.json({ url, name });
  } catch (err) {
    console.error('Error uploading attachment:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// GET /api/health - liveness check for Docker healthchecks and monitoring
app.get('/api/health', (_req: Request, res: Response) => {
  try {
    db.prepare('SELECT 1').get();
    res.json({ status: 'ok' });
  } catch {
    res.status(500).json({ status: 'error' });
  }
});

// ─── Wiki export ──────────────────────────────────────────────────────────────

// Make a page title safe to use as a file or directory name in the zip
function safeFilename(title: string): string {
  const cleaned = title
    .replace(/[/\\:*?"<>|#%]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return cleaned || 'Untitled';
}

// GET /api/export - download the entire wiki as a zip of Markdown files,
// organised in directories following the page hierarchy, plus all uploads.
app.get('/api/export', (_req: Request, res: Response) => {
  try {
    const pages = db
      .prepare('SELECT id, title, content, parent_id FROM pages ORDER BY position ASC, created_at ASC')
      .all() as { id: string; title: string; content: string; parent_id: string | null }[];

    // Group pages by parent; pages with a missing parent become root pages
    const ids = new Set(pages.map((p) => p.id));
    const childrenOf = new Map<string | null, typeof pages>();
    for (const p of pages) {
      const key = p.parent_id && ids.has(p.parent_id) ? p.parent_id : null;
      const list = childrenOf.get(key) ?? [];
      list.push(p);
      childrenOf.set(key, list);
    }

    // Assign each page a zip path; children live in a directory named after
    // their parent page. Duplicate titles get a numeric suffix.
    const exportPath = new Map<string, string>();
    const assignPaths = (parentId: string | null, dir: string) => {
      const used = new Set<string>();
      for (const p of childrenOf.get(parentId) ?? []) {
        const base = safeFilename(p.title);
        let name = base;
        let i = 2;
        while (used.has(name.toLowerCase())) name = `${base} (${i++})`;
        used.add(name.toLowerCase());
        const full = dir ? `${dir}/${name}` : name;
        exportPath.set(p.id, full);
        assignPaths(p.id, full);
      }
    };
    assignPaths(null, '');

    const turndown = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
    });
    turndown.use(gfm);

    // Directory depth of the page currently being converted, so links to
    // other pages and uploads can be made relative
    const ctx = { depth: 0 };
    const rel = (target: string) => '../'.repeat(ctx.depth) + target;

    turndown.addRule('wikiLink', {
      filter: (node) => node.nodeName === 'SPAN' && !!node.getAttribute('data-page-id'),
      replacement: (content, node) => {
        const pageId = (node as HTMLElement).getAttribute('data-page-id') ?? '';
        const target = exportPath.get(pageId);
        return target ? `[${content}](<${rel(target)}.md>)` : content;
      },
    });
    turndown.addRule('callout', {
      filter: (node) => node.nodeName === 'DIV' && node.getAttribute('data-type') === 'callout',
      replacement: (content, node) => {
        const type = (node as HTMLElement).getAttribute('data-callout-type') ?? 'info';
        const body = content.trim().replace(/\n/g, '\n> ');
        return `\n\n> **${type.toUpperCase()}:** ${body}\n\n`;
      },
    });
    // Interactive widgets (table of contents, child-page list) have no
    // meaning outside the app
    turndown.addRule('dropWidgets', {
      filter: (node) =>
        node.nodeName === 'DIV' &&
        ['table-of-contents', 'page-tree'].includes(node.getAttribute('data-type') ?? ''),
      replacement: () => '',
    });

    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="myinfrawiki-export-${date}.zip"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
      console.error('Export failed:', err);
      res.destroy(err);
    });
    archive.pipe(res);

    for (const p of pages) {
      const pagePath = exportPath.get(p.id)!;
      ctx.depth = pagePath.split('/').length - 1;
      // Point upload references at the uploads/ directory in the zip
      const html = p.content.split('"/uploads/').join(`"${rel('uploads/')}`);
      const markdown = `# ${p.title}\n\n${turndown.turndown(html)}\n`;
      archive.append(markdown, { name: `${pagePath}.md` });
    }

    if (fs.existsSync(UPLOADS_PATH)) {
      archive.directory(UPLOADS_PATH, 'uploads');
    }
    archive.finalize();
  } catch (err) {
    console.error('Error exporting wiki:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Export failed' });
  }
});

// Unknown API routes must return 404 instead of falling through to index.html
app.use('/api', (_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
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
  // Upload validation errors (file too large, disallowed type) are client errors
  if (err instanceof multer.MulterError || err.message.includes('is not allowed')) {
    return res.status(400).json({ error: err.message });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

const server = app.listen(PORT, () => {
  console.log(`MyInfraWiki backend running on port ${PORT} (${NODE_ENV})`);
  console.log(`Database: ${DB_PATH}`);
  console.log(`Uploads: ${UPLOADS_PATH}`);
});

process.on('SIGTERM', () => {
  server.close(() => {
    db.close();
    process.exit(0);
  });
});

export default app;
