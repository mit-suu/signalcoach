/**
 * In-session hints on/off, remembered per browser. Defaults to on; a blocked or broken storage
 * never throws — it just behaves as "on" (read) or is ignored (write). Pure, so `node --test`
 * covers it (hints.test.ts); SessionRoom wires it to localStorage.
 */
export const HINTS_KEY = "signalcoach.hints";

type Store = Pick<Storage, "getItem" | "setItem">;

export function readHintsPref(store: Store | null | undefined): boolean {
  try {
    return store?.getItem(HINTS_KEY) !== "off";
  } catch {
    return true;
  }
}

/** Returns false when the choice could not be saved (caller keeps it in memory instead). */
export function writeHintsPref(store: Store | null | undefined, on: boolean): boolean {
  try {
    if (!store) return false;
    store.setItem(HINTS_KEY, on ? "on" : "off");
    return true;
  } catch {
    return false;
  }
}
