/**
 * Preload script — bridges the renderer to the main-process IPC handlers.
 *
 * Written as CommonJS (`.cts` → `.cjs`) because Electron's sandboxed
 * renderers only support CommonJS preload scripts; the article shows an
 * ESM-style preload without mentioning this constraint.
 */
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("notes", {
  create: (title: string, body: string) => ipcRenderer.invoke("notes:create", title, body),
  list: () => ipcRenderer.invoke("notes:list"),
  search: (term: string) => ipcRenderer.invoke("notes:search", term),
  delete: (id: string) => ipcRenderer.invoke("notes:delete", id)
});
