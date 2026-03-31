# MyInfraWiki

<img src="frontend/public/logo-icon.png" alt="MyInfraWiki" width="160">

**MyInfraWiki** is een zelfgehoste wiki-applicatie, speciaal ontworpen voor het documenteren van infrastructuur. Gebouwd op [TipTap](https://tiptap.dev/), met een moderne editor, donkere modus en volledige ondersteuning voor hiërarchische pagina-structuren.

---

## Features

- **Rijke teksteditor** – opmaak, headings, lijsten, tabellen, blockquotes, takenlijsten en meer
- **Codeblokken** – syntax highlighting voor 190+ talen, regelnummers, kopieerknop en taalkeuze
- **Callout-blokken** – info, waarschuwing en fout, met Confluence-achtige stijl
- **Hiërarchische pagina's** – pagina's nesten onder andere pagina's via drag-and-drop
- **Interne paginakoppelingen** – koppel direct naar andere wiki-pagina's
- **Table of Contents** – automatisch gegenereerd op basis van headings
- **Pagina-boomstructuur** – toon subpagina's van de huidige pagina
- **Afbeeldingen** – uploaden via drag-and-drop of plakken vanuit klembord
- **Automatische URL-herkenning** – geplakte links worden automatisch klikbaar
- **Bevestiging bij sluiten** – waarschuwing bij niet-opgeslagen wijzigingen
- **Donkere modus** – volledig ondersteund

---

## Snel starten

### Met Docker Compose (aanbevolen)

Maak een `docker-compose.yml` aan:

```yaml
services:
  myinfrawiki:
    build: .
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

Start de container:

```bash
docker compose up -d
```

MyInfraWiki is nu bereikbaar via [http://localhost:3000](http://localhost:3000).

---

### Met Docker Run

Bouw eerst de image:

```bash
docker build -t myinfrawiki .
```

Start de container:

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
  myinfrawiki
```

---

## Omgevingsvariabelen

| Variabele       | Standaard         | Omschrijving                          |
|-----------------|-------------------|---------------------------------------|
| `PORT`          | `3000`            | Poort waarop de server luistert       |
| `DATABASE_PATH` | `/data/wiki.db`   | Pad naar de SQLite-database           |
| `UPLOADS_PATH`  | `/data/uploads`   | Map voor geüploade afbeeldingen       |
| `NODE_ENV`      | `production`      | Omgeving (`production` / `development`) |

---

## Back-up

Alle gegevens worden opgeslagen in het Docker-volume `wiki-data`, onder `/data` in de container:

| Bestand/map      | Inhoud                          |
|------------------|---------------------------------|
| `/data/wiki.db`  | Database met alle pagina's      |
| `/data/uploads/` | Geüploade afbeeldingen          |

**Back-up maken (container hoeft niet gestopt te worden):**

```bash
# Database
docker run --rm \
  -v wiki-data:/data \
  -v $(pwd):/backup \
  alpine cp /data/wiki.db /backup/wiki.db

# Afbeeldingen
docker run --rm \
  -v wiki-data:/data \
  -v $(pwd):/backup \
  alpine cp -r /data/uploads /backup/uploads
```

**Herstellen:**

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

## Technische stack

| Onderdeel  | Technologie                        |
|------------|------------------------------------|
| Frontend   | React, TypeScript, TipTap v2       |
| Backend    | Node.js, Express, TypeScript       |
| Database   | SQLite (via `better-sqlite3`)       |
| Bundler    | Vite                               |
| Container  | Docker (multi-stage build)         |
