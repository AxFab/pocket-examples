/**
 * Renderer logic.
 *
 * The article shows this part as a React component (`App.tsx`); the
 * scaffold it recommends (`npm create electron-app -- --template=vite`)
 * ships neither React nor TypeScript, so this example uses vanilla DOM
 * code with the exact same `window.notes` API surface.
 *
 * No database logic here — the main process owns the database, the
 * renderer just calls handlers (the article's core point).
 */

/** Result shape of the `notes:*` IPC handlers (plain JSON over IPC). */
interface NoteDoc {
  _id: string;
  title: string;
  body: string;
  createdAt: number;
}

/** API exposed by the preload script via `contextBridge`. */
interface NotesApi {
  create(title: string, body: string): Promise<{ acknowledged: true; insertedId: string }>;
  list(): Promise<NoteDoc[]>;
  search(term: string): Promise<NoteDoc[]>;
  delete(id: string): Promise<{ acknowledged: true; deletedCount: 0 | 1 }>;
}

declare global {
  interface Window {
    notes: NotesApi;
  }
}

const form = document.getElementById("create-form") as HTMLFormElement;
const titleInput = document.getElementById("title") as HTMLInputElement;
const bodyInput = document.getElementById("body") as HTMLTextAreaElement;
const searchInput = document.getElementById("search") as HTMLInputElement;
const list = document.getElementById("notes-list") as HTMLUListElement;

/** Renders the given notes into the list. */
function render(notes: NoteDoc[]): void {
  list.replaceChildren(
    ...notes.map((note) => {
      const item = document.createElement("li");
      const heading = document.createElement("h3");
      heading.textContent = note.title;
      const body = document.createElement("p");
      body.textContent = note.body;
      const date = document.createElement("small");
      date.textContent = new Date(note.createdAt).toLocaleString();
      const remove = document.createElement("button");
      remove.textContent = "Delete";
      remove.addEventListener("click", () => void handleDelete(note._id));
      item.append(heading, body, date, document.createTextNode(" "), remove);
      return item;
    })
  );
}

async function refresh(): Promise<void> {
  render(await window.notes.list());
}

async function handleCreate(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  await window.notes.create(titleInput.value, bodyInput.value);
  form.reset();
  await refresh();
}

async function handleSearch(): Promise<void> {
  const term = searchInput.value.trim();
  render(term ? await window.notes.search(term) : await window.notes.list());
}

async function handleDelete(id: string): Promise<void> {
  await window.notes.delete(id);
  await refresh();
}

form.addEventListener("submit", (event) => void handleCreate(event));
searchInput.addEventListener("input", () => void handleSearch());

void refresh();

export {};
