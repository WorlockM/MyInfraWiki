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
`);

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

    db.prepare(
      'UPDATE pages SET title = ?, content = ?, parent_id = ?, position = ?, updated_at = ? WHERE id = ?'
    ).run(newTitle, newContent, newParentId, newPosition, now, req.params.id);

    const page = db.prepare('SELECT * FROM pages WHERE id = ?').get(req.params.id);
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

    res.json({ success: true, deleted: allIds.length });
  } catch (err) {
    console.error('Error deleting page:', err);
    res.status(500).json({ error: 'Failed to delete page' });
  }
});

// GET /api/search?q=query - full text search
app.get('/api/search', (req: Request, res: Response) => {
  try {
    const q = (req.query.q as string || '').trim();
    if (!q) {
      return res.json([]);
    }

    const searchTerm = `%${q}%`;
    const results = db
      .prepare(
        `SELECT id, title, content FROM pages
         WHERE title LIKE ? OR content LIKE ?
         ORDER BY
           CASE WHEN title LIKE ? THEN 0 ELSE 1 END,
           updated_at DESC
         LIMIT 20`
      )
      .all(searchTerm, searchTerm, searchTerm) as { id: string; title: string; content: string }[];

    const formatted = results.map((row) => {
      // Extract a snippet around the match
      let snippet = '';
      const contentLower = row.content.toLowerCase();
      const qLower = q.toLowerCase();
      const idx = contentLower.indexOf(qLower);
      if (idx !== -1) {
        const start = Math.max(0, idx - 60);
        const end = Math.min(row.content.length, idx + q.length + 60);
        snippet = (start > 0 ? '...' : '') + row.content.slice(start, end).replace(/<[^>]+>/g, '') + (end < row.content.length ? '...' : '');
      } else {
        // Use beginning of content as snippet
        snippet = row.content.replace(/<[^>]+>/g, '').slice(0, 120) + (row.content.length > 120 ? '...' : '');
      }
      return { id: row.id, title: row.title, snippet };
    });

    res.json(formatted);
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
