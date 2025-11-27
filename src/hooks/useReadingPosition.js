import { useState, useEffect } from 'react';
import { getBookmark, setBookmark } from '../utils/bookmark';

/**
 * Hook to manage reading position for page-based reading
 * Saves and restores: { chapterId, pageIndex, subchapterId? }
 */
export const useReadingPosition = () => {
  const [position, setPosition] = useState(null);

  // Load saved position on mount
  useEffect(() => {
    const saved = getBookmark();
    if (saved) {
      setPosition({
        chapterId: saved.chapterId,
        pageIndex: saved.pageIndex || 0,
        subchapterId: saved.subchapterId || null,
      });
    }
  }, []);

  // Save position
  const savePosition = (newPosition) => {
    const positionData = {
      chapterId: newPosition.chapterId,
      pageIndex: newPosition.pageIndex || 0,
      subchapterId: newPosition.subchapterId || null,
    };
    setPosition(positionData);
    setBookmark(positionData);
  };

  return { position, savePosition };
};

