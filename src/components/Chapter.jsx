import { useState } from 'react';
import { useEditorMode } from '../hooks/useEditorMode';
import { renderMarkdownWithParagraphs } from '../utils/markdown';
import './Chapter.css';
import { SortableSubchapters } from './SortableSubchapters';
import { setBookmark } from '../utils/bookmark';

export const Chapter = ({ chapter, level = 0, chapterNumber = 1, subChapterNumber = null, parentChapterId = null, onEdit, onAddSubchapter, onDelete, dragHandleProps, defaultExpandedChapterId }) => {
  const [isExpanded, setIsExpanded] = useState(chapter.id === defaultExpandedChapterId);
  const { isEditor } = useEditorMode();

  // Generate formal numbering (no "Chapter" label)
  const getFormalNumber = () => {
    if (level === 0) {
      return `${chapterNumber}.`;
    } else {
      return `${chapterNumber}.${subChapterNumber}`;
    }
  };

  // Convert ALL CAPS to Title Case (first letter uppercase, rest lowercase)
  const formatTitle = (title) => {
    if (!title) return title;
    let t = title;
    // If the title is ALL CAPS (and not numeric/punctuation), normalize to lowercase first
    if (t === t.toUpperCase() && t !== t.toLowerCase()) {
      t = t.toLowerCase();
    }
    // Capitalize the first alphabetical character only
    return t.replace(/[A-Za-zÀ-ÖØ-öø-ÿ]/, (m) => m.toUpperCase());
  };

  return (
    <div id={`chapter-${chapter.id}`} className={`chapter ${level > 0 ? 'subchapter' : ''} ${isExpanded ? 'expanded' : ''}`} style={{ marginLeft: `${level * 1.5}rem` }}>
      <div className="chapter-header" onClick={() => { const next = !isExpanded; setIsExpanded(next); if (next) setBookmark(chapter.id); }}>
        {isEditor && (
          <div className="chapter-actions-inline" onClick={(e) => e.stopPropagation()}>
            <button className="btn-action btn-edit" onClick={() => onEdit(chapter)}>Edit</button>
            {level === 0 && (
              <button className="btn-action btn-add-sub" onClick={() => onAddSubchapter(chapter)}>Add</button>
            )}
            <button className="btn-action btn-delete" onClick={() => onDelete(chapter.id, level > 0, level > 0 ? parentChapterId : null)}>Del</button>
          </div>
        )}
        {/** Title element with class per level for precise styling/hover */}
        <h3 className={level === 0 ? 'chapter-title' : 'subchapter-title'}>
          <span className="chapter-number">{getFormalNumber()}</span> {formatTitle(chapter.title)}
        </h3>
        {isEditor && (
          <span {...(dragHandleProps || {})} style={{ cursor: 'grab', marginLeft: '0.5rem', userSelect: 'none' }} aria-label="Drag handle">⋮⋮</span>
        )}
      </div>
      
      {isExpanded && (
        <div className="chapter-body">
          {/* Show chapter content if it exists (both main and subchapters) */}
          {chapter.content && (
            <div 
              className="chapter-content"
              dangerouslySetInnerHTML={{ __html: renderMarkdownWithParagraphs(chapter.content) }}
            />
          )}
          
          {/* Render child chapters recursively */}
          {chapter.children && chapter.children.length > 0 && (
            <div className="child-chapters">
              <SortableSubchapters
                items={chapter.children}
                onReorder={async (orderedIds) => {
                  // Persist subchapter order for this chapter
                  try {
                    const { reorderSubchapters } = await import('../services/firestore.js');
                    await reorderSubchapters('primary', chapter.id, orderedIds);
                  } catch {}
                }}
                renderRow={(childChapter, dragHandle, index) => (
                  <Chapter
                    key={childChapter.id}
                    chapter={childChapter}
                    level={level + 1}
                    chapterNumber={chapterNumber}
                    subChapterNumber={index + 1}
                    parentChapterId={chapter.id}
                    dragHandleProps={dragHandle}
                    onEdit={onEdit}
                    onAddSubchapter={onAddSubchapter}
                    onDelete={onDelete}
                  />
                )}
              />
            </div>
          )}
        </div>
      )}
      
      {/* Removed large action buttons block in favor of inline actions */}
    </div>
  );
};

