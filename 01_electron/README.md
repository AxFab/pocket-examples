# Example 01 — Electron note-taking app

Companion project for the article *"Build an Electron app with local data
storage — no SQLite bindings, no server"*. A minimal notes app (create,
list, search, delete) where the Electron main process owns a pocket-db
database and the renderer talks to it over IPC.

## Layout

```
src/main/index.ts          Electron entry point: window + IPC handlers
src/main/db.ts             Database bootstrap: open, index, migrations
src/main/notes-service.ts  Note operations (electron-free, unit-tested)
src/preload/index.cts      contextBridge → ipcRenderer (CommonJS)
src/renderer/              index.html + vanilla TS UI
src/tests/notes.test.ts    node:test coverage of every db code path
```

## Run

```bash
npm install
npm start        # build + launch Electron
npm test         # build + run the db-logic tests (no Electron needed)
```

## Read the article on Dev.to

[https://dev.to/axfab/build-an-electron-app-with-local-data-storage-no-sqlite-bindings-no-server-45b3]
