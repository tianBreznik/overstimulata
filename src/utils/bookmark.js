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

export function setBookmark(chapterId) {
  try {
    const data = { chapterId, ts: Date.now() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}


