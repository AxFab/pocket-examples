/**
 * Electron main process entry point.
 *
 * Owns the database (per the article: database access belongs in the main
 * process) and exposes note operations to the renderer through IPC.
 */
import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initDatabase, type NotesDatabase } from "./db.js";
import { createNote, deleteNote, listNotes, searchNotes } from "./notes-service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let database: NotesDatabase | null = null;

function registerIpcHandlers(notesDb: NotesDatabase): void {
  const { notes } = notesDb;

  ipcMain.handle("notes:create", (_event, title: string, body: string) =>
    createNote(notes, title, body)
  );

  ipcMain.handle("notes:list", () => listNotes(notes));

  ipcMain.handle("notes:search", (_event, term: string) => searchNotes(notes, term));

  ipcMain.handle("notes:delete", (_event, id: string) => deleteNote(notes, id));
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 900,
    height: 640,
    webPreferences: {
      // Preload is compiled to CommonJS (`index.cjs`) so it loads in the
      // default sandboxed renderer, where ESM preloads are not supported.
      preload: path.join(__dirname, "../preload/index.cjs"),
      contextIsolation: true
    }
  });

  void window.loadFile(path.join(__dirname, "../renderer/index.html"));
}

app.whenReady().then(() => {
  // The article opens the database at module load; doing it after
  // `whenReady` keeps the startup order explicit and lets us create the
  // userData directory first (see db.ts).
  database = initDatabase(app.getPath("userData"));
  registerIpcHandlers(database);
  createWindow();

  // Compact during natural pauses (article suggestion).
  app.on("browser-window-blur", () => database?.db.compact());

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// `before-quit` may fire more than once if quit is interrupted; guard the
// close so we never double-release.
app.on("before-quit", () => {
  database?.db.close();
  database = null;
});
