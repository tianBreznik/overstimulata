import { useState, useEffect } from 'react';
import './ReaderTopBar.css';

/**
 * Top bar component showing current chapter/subchapter name.
 * Fades in when a page with body content is shown and fades out automatically.
 */
export const ReaderTopBar = ({ chapterTitle, subchapterTitle, pageKey }) => {
  const [showBar, setShowBar] = useState(false);

  useEffect(() => {
    setShowBar(true);
    const timer = setTimeout(() => setShowBar(false), 2600);
    return () => clearTimeout(timer);
  }, [pageKey]);

  const displayTitle = subchapterTitle || chapterTitle || '';

  if (!displayTitle) return null;

  return (
    <div className={`reader-top-bar ${showBar ? 'visible' : ''}`}>
      <div className="reader-top-bar-content">
        <span className="reader-chapter-title">{displayTitle}</span>
      </div>
    </div>
  );
};


