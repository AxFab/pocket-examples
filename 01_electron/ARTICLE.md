
# Build an Electron app with local data storage — no SQLite bindings, no server

If you've shipped an Electron app that persists structured data, you've probably hit the wall at some point. You need something more than a flat JSON file, but a full database server is absurd for a desktop app. So you reach for better-sqlite3 — and then spend the next hour fighting native bindings.

---

## The Electron storage problem

Electron bundles its own version of Node.js. That version almost never matches the one on your machine. Native Node modules — the ones that compile C++ bindings — need to be recompiled specifically for the Electron runtime, using `electron-rebuild` or equivalent tooling.

In practice this means:

- Every Electron update potentially breaks your native dependencies
- CI pipelines need platform-specific build steps for Windows, macOS and Linux
- Code signing and notarization on macOS gets complicated by native binaries
- End users on some machines encounter install failures you can't reproduce locally

better-sqlite3 is an excellent library. But it is a native module, and native modules in Electron are a tax you pay forever.

The alternatives people reach for have their own problems. lowdb and lokijs keep everything in memory and flush to disk — fine for small datasets, but you lose durability on crash and memory usage grows with your data. nedb hasn't been maintained in years. A remote database is obviously wrong for a local desktop app.

---

## What you actually need

For most Electron apps, the storage requirements are modest but specific:

- Structured documents, not just key-value pairs
- Queries that go beyond "give me everything"
- Writes that survive a crash
- Zero native binaries — pure JavaScript, works everywhere Electron runs
- No server process running alongside your app

That's exactly the gap pocket-db is designed to fill. It's a single-file embedded document store — the SQLite model applied to JSON documents, with a MongoDB-style API. Pure TypeScript, shipped as both ESM and CommonJS. No native bindings. No optional dependencies.

---

## Building the example app

Let's build a small note-taking app: create, list, search and delete notes. Simple enough to follow in full, realistic enough to show the pattern.

### Setup

We'll use [electron-vite](https://electron-vite.org), which scaffolds the `src/main` / `src/preload` / `src/renderer` layout used below, with TypeScript and React ready to go:

```bash
npm create @quick-start/electron@latest my-notes -- --template react-ts
cd my-notes
npm install @axfab/pocket-db
```

No `electron-rebuild`. No postinstall scripts. That's the point.

### Initialising the database

In Electron, database access belongs in the main process. You have access to the filesystem there, and it keeps your renderer process clean. Use `app.getPath('userData')` — Electron's standard location for app data, persisted across updates.

One thing to know: Electron creates the `userData` directory lazily, so on a first launch it may not exist yet — and `open()` does not create parent directories. Create it before opening:

```ts
// src/main/db.ts
import { app } from 'electron'
import { open } from '@axfab/pocket-db'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const dataDir = app.getPath('userData')
mkdirSync(dataDir, { recursive: true }) // may not exist on first launch

export const db = open({ path: path.join(dataDir, 'notes.pdb') })
export const notes = db.collection('notes')
```

One file, one call. The database is created if it doesn't exist. No migrations, no schema definition.

### Exposing database operations via IPC

Electron's security model means the renderer can't touch Node APIs directly. You expose operations through IPC handlers in the main process and call them via `contextBridge` in the preload script.

Search deserves a moment of care: the search term comes from user input, and `$regex` compiles it as a regular expression. A term containing `(` or `[` would throw, and a raw pattern is case-sensitive. Escape the input and pass `$options: 'i'`:

```ts
// src/main/index.ts
import { app, BrowserWindow, ipcMain } from 'electron'
import { db, notes } from './db'

/** Escapes regex metacharacters so user input is matched literally. */
const escapeRegex = (term: string) =>
  term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

ipcMain.handle('notes:create', (_event, title: string, body: string) => {
  return notes.insertOne({ title, body, createdAt: Date.now() })
})

ipcMain.handle('notes:list', () => {
  return notes.find().sort({ createdAt: -1 }).toArray()
})

ipcMain.handle('notes:search', (_event, term: string) => {
  const pattern = escapeRegex(term)
  return notes.find({
    $or: [
      { title: { $regex: pattern, $options: 'i' } },
      { body:  { $regex: pattern, $options: 'i' } }
    ]
  }).toArray()
})

ipcMain.handle('notes:delete', (_event, id: string) => {
  return notes.deleteOne(id)
})

app.on('before-quit', () => db.close())
```

```ts
// src/preload/index.ts
// Note: keep the preload compiled to CommonJS (electron-vite's default) —
// sandboxed renderers don't load ESM preload scripts.
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('notes', {
  create:  (title: string, body: string) => ipcRenderer.invoke('notes:create', title, body),
  list:    ()           => ipcRenderer.invoke('notes:list'),
  search:  (term: string) => ipcRenderer.invoke('notes:search', term),
  delete:  (id: string) => ipcRenderer.invoke('notes:delete', id),
})
```

### Using it in the renderer

From the renderer, the API is just async function calls:

```ts
// src/renderer/src/App.tsx
const handleCreate = async () => {
  await window.notes.create(title, body)
  setNotes(await window.notes.list())
}

const handleSearch = async (term: string) => {
  const results = await window.notes.search(term)
  setNotes(results)
}

const handleDelete = async (id: string) => {
  await window.notes.delete(id)
  setNotes(await window.notes.list())
}
```

No database logic in the renderer. No connection strings. No async initialisation to wait for. The main process owns the database, the renderer just calls handlers.

### Where indexes help — and where they don't

Two things to know about pocket-db's query planner in V1: `$regex` is never index-assisted (it's always evaluated against the documents), and `$or` queries bypass index planning entirely. So the regex search above is a full collection scan — perfectly fine for a notes app, but don't expect an index to speed it up.

Indexes shine on equality and range lookups. Say notes belong to notebooks:

```ts
// run once at startup, safe to call repeatedly
notes.createIndex('notebook', { type: 'string' })
```

Now a query like `notes.find({ notebook: 'work' })` reads only the matching documents instead of scanning the collection — the planner picks the index up automatically, no change needed in your query code. The same goes for a number index on `createdAt` if you query by date range.

### Periodic compaction

The append-only log accumulates dead records as notes are edited and deleted. Schedule compaction when the app is idle:

```ts
app.on('browser-window-blur', () => {
  db.compact()
})
```

`compact()` is fast and synchronous — it rewrites the file in a single forward pass. Calling it when the window loses focus means it runs during natural pauses without affecting responsiveness.

---

## Packaging and distribution

This is where the native module problem usually surfaces. With pocket-db, there's nothing to rebuild. The electron-vite scaffold already wires up electron-builder; its config just works as-is:

```yaml
# electron-builder.yml (generated by the scaffold)
mac:
  target: dmg
win:
  target: nsis
linux:
  target: AppImage
```

No `electron-rebuild` in your build pipeline. No platform-specific post-install hooks. The same config builds cleanly on all three platforms.

If you're using GitHub Actions to build releases:

```yaml
# .github/workflows/release.yml
- name: Build
  run: npm run build && npx electron-builder
  # No electron-rebuild step needed
```

One fewer thing to maintain.

---

## What about data migration?

pocket-db is schemaless — documents in the same collection can have different shapes. That means additive changes (adding a new field) require nothing: new documents have the field, old ones don't, and `$exists` lets you query for either.

For breaking changes, a one-time migration on startup is straightforward. Keep a version marker in a metadata collection — and remember that on a fresh database the marker doesn't exist yet:

```ts
const schema = db.collection('_meta')
const marker = schema.findOne({ key: 'version' })
const version = typeof marker?.value === 'number' ? marker.value : 0

if (version < 2) {
  // run migration
  notes.updateMany({}, { $set: { archived: false } })

  if (marker) {
    schema.replaceOne(marker._id as string, { key: 'version', value: 2 })
  } else {
    schema.insertOne({ key: 'version', value: 2 })
  }
}
```

Note the `replaceOne(marker._id, …)` call: the first argument is the document **id**. (Passing a full document as the only argument is a separate overload that replaces that document by itself — not what you want here.)

No migration framework needed for most desktop app scenarios.

---

## The trade-offs to know

pocket-db is designed for single-process use. An Electron app fits that model perfectly — the main process is the only writer, and that's exactly the intended use case.

It is not the right choice if your Electron app spawns multiple Node worker processes that all need to write to the same database simultaneously. It is also not the right choice if you're storing hundreds of thousands of documents and need complex aggregation — at that scale, an actual database server starts making sense even in a desktop context.

For the common case — a desktop app storing user data, preferences, history, cached API responses, local task lists — it fits well.

---

## Getting started

```bash
npm install @axfab/pocket-db
```

Full documentation at [pocket-db.axfab.net](https://pocket-db.axfab.net). Source and issues at [github.com/axfab/pocket-db](https://github.com/axfab/pocket-db). The complete example app from this article is in the [repository of exemple](https://github.com/AxFab/pocket-example/tree/develop/01_electron), tests included.

If you've been putting up with native binding headaches in Electron, give it a try and let me know how it goes.

---

*pocket-db is MIT licensed.*
