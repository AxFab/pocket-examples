# pocket-db examples

Standalone example projects demonstrating [@axfab/pocket-db](https://github.com/AxFab/pocket-db),
an embedded NoSQL document database for Node.js persisted in a single
append-only file.

This repository is kept separate from the main pocket-db repository so the
published package stays lean. Each example is a self-contained project with
its own `package.json`, build, and tests.

## Examples

| Example | Description |
|---------|-------------|
| [`01_electron`](./01_electron) | Note-taking Electron app. The main process owns the database, the renderer talks to it over IPC (`contextBridge` + `ipcMain.handle`). Covers indexing, search, compaction, and startup migrations. Companion project for the article *"Build an Electron app with local data storage — no SQLite bindings, no server"* (see `01_electron/ARTICLE.md`). |

## Running an example

```bash
cd 01_electron
npm install
npm test         # build + run the database-logic tests (no GUI needed)
npm start        # build + launch the app
```

## Developing against local pocket-db sources

The examples install `@axfab/pocket-db` from npm. But if this folder
lives inside the main repository, `01_electron` can depends on `file:../..`
(the local checkout) :

```json
"dependencies": {
  "@axfab/pocket-db": "file:../.." // unstead of ^0.1.2
}
```

To test an unpublished change against an example, point the dependency at
your local checkout (`npm install ../path/to/pocket-db`) and make sure it
is built first (`npm run build` in the pocket-db repository).

## License

MIT — same as pocket-db.
