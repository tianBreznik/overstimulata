const STORAGE_KEY = 'bookmark:v1';

export function getBookmark() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setBookmark(data) {
  try {
    // Support both old format (just chapterId) and new format (object)
    const bookmarkData = typeof data === 'string' 
      ? { chapterId: data, ts: Date.now() }
      : { ...data, ts: Date.now() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarkData));
  } catch {}
}


