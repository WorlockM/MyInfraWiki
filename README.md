# MyInfraWiki

<p align="center">
  <img src="frontend/public/logo-icon.png" alt="MyInfraWiki" width="160">
</p>

**MyInfraWiki** is a self-hosted wiki application designed for documenting infrastructure. Built on [TipTap](https://tiptap.dev/), with a modern rich-text editor, dark mode support, and full hierarchical page structures.

---

## Features

- **Rich text editor** – formatting, headings, lists, tables, blockquotes, task lists and more
- **Code blocks** – syntax highlighting for 190+ languages, line numbers, copy button and language selector
- **Callout blocks** – info, warning and error styles, similar to Confluence
- **Hierarchical pages** – nest pages under other pages via drag-and-drop
- **Internal page links** – link directly to other wiki pages
- **Table of Contents** – automatically generated from headings
- **Page tree** – display child pages of the current page
- **Images** – upload via drag-and-drop or paste from clipboard
- **Automatic URL detection** – pasted links are automatically made clickable
- **Unsaved changes warning** – confirmation dialog when navigating away with unsaved changes
- **Dark mode** – fully supported
- **Mobile-friendly** – responsive layout with slide-in sidebar, touch-optimised toolbar and scrollable tables

---

## Getting started

### With Docker Compose (recommended)

Create a `docker-compose.yml`:

```yaml
services:
  myinfrawiki:
    image: ghcr.io/worlock/myinfrawiki:latest
    ports:
      - "3000:3000"
    volumes:
      - wiki-data:/data
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - DATABASE_PATH=/data/wiki.db
      - UPLOADS_PATH=/data/uploads
      - PORT=3000

volumes:
  wiki-data:
```

Start the container:

```bash
docker compose up -d
```

MyInfraWiki is now available at [http://localhost:3000](http://localhost:3000).

---

### With Docker Run

```bash
docker run -d \
  --name myinfrawiki \
  -p 3000:3000 \
  -v wiki-data:/data \
  --restart unless-stopped \
  -e NODE_ENV=production \
  -e DATABASE_PATH=/data/wiki.db \
  -e UPLOADS_PATH=/data/uploads \
  -e PORT=3000 \
  ghcr.io/worlock/myinfrawiki:latest
```

---

## Environment variables

| Variable        | Default           | Description                              |
|-----------------|-------------------|------------------------------------------|
| `PORT`          | `3000`            | Port the server listens on               |
| `DATABASE_PATH` | `/data/wiki.db`   | Path to the SQLite database file         |
| `UPLOADS_PATH`  | `/data/uploads`   | Directory for uploaded images            |
| `NODE_ENV`      | `production`      | Environment (`production` / `development`) |

---

## Backup

All data is stored in the Docker volume `wiki-data`, mounted at `/data` inside the container:

| Path             | Contents                        |
|------------------|---------------------------------|
| `/data/wiki.db`  | Database with all pages         |
| `/data/uploads/` | Uploaded images                 |

**Create a backup (container does not need to be stopped):**

```bash
# Database
docker run --rm \
  -v wiki-data:/data \
  -v $(pwd):/backup \
  alpine cp /data/wiki.db /backup/wiki.db

# Uploads
docker run --rm \
  -v wiki-data:/data \
  -v $(pwd):/backup \
  alpine cp -r /data/uploads /backup/uploads
```

**Restore:**

```bash
docker run --rm \
  -v wiki-data:/data \
  -v $(pwd):/backup \
  alpine cp /backup/wiki.db /data/wiki.db

docker run --rm \
  -v wiki-data:/data \
  -v $(pwd):/backup \
  alpine cp -r /backup/uploads /data/uploads

docker compose restart myinfrawiki
```

---

## Tech stack

| Layer     | Technology                         |
|-----------|------------------------------------|
| Frontend  | React, TypeScript, TipTap v2       |
| Backend   | Node.js, Express, TypeScript       |
| Database  | SQLite (via `better-sqlite3`)      |
| Bundler   | Vite                               |
| Container | Docker (multi-stage build)         |
