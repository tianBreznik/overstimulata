/**
 * Footnote parsing and rendering utilities
 * 
 * Syntax: ^[footnote content here]
 * This will be replaced with a superscript number and the content
 * will be displayed at the bottom of the page-frame.
 */

/**
 * Parse footnotes from content and return structured data
 * @param {string} content - The chapter content with ^[footnote] syntax
 * @returns {Object} - { content: cleaned content, footnotes: array of {id, content, index} }
 */
export const parseFootnotes = (content) => {
  if (!content) return { content: '', footnotes: [] };
  
  const footnoteRegex = /\^\[([^\]]+)\]/g;
  const footnotes = [];
  let match;
  let footnoteIndex = 0;
  
  // Find all footnotes and collect them
  while ((match = footnoteRegex.exec(content)) !== null) {
    const fullMatch = match[0]; // ^[content]
    const footnoteContent = match[1]; // content
    const startIndex = match.index;
    
    footnotes.push({
      id: `fn-${startIndex}`, // Unique ID based on position
      content: footnoteContent.trim(),
      index: startIndex,
      fullMatch: fullMatch,
    });
    
    footnoteIndex++;
  }
  
  return {
    content: content, // Keep original for now, will be replaced during rendering
    footnotes: footnotes,
  };
};

/**
 * Get all footnotes from all chapters for global numbering
 * @param {Array} chapters - Array of chapter objects with content
 * @returns {Array} - Array of footnotes with global numbering
 */
export const getAllFootnotes = (chapters) => {
  if (!chapters || chapters.length === 0) return [];
  
  const allFootnotes = [];
  let globalNumber = 1;
  
  chapters.forEach((chapter) => {
    // Parse chapter content
    if (chapter.content) {
      const parsed = parseFootnotes(chapter.content);
      parsed.footnotes.forEach((fn) => {
        allFootnotes.push({
          ...fn,
          globalNumber: globalNumber++,
          chapterId: chapter.id,
          chapterTitle: chapter.title,
        });
      });
    }
    
    // Parse subchapter content
    if (chapter.children) {
      chapter.children.forEach((subchapter) => {
        if (subchapter.content) {
          const parsed = parseFootnotes(subchapter.content);
          parsed.footnotes.forEach((fn) => {
            allFootnotes.push({
              ...fn,
              globalNumber: globalNumber++,
              chapterId: chapter.id,
              subchapterId: subchapter.id,
              chapterTitle: chapter.title,
              subchapterTitle: subchapter.title,
            });
          });
        }
      });
    }
  });
  
  return allFootnotes;
};

/**
 * Replace footnote syntax with superscript numbers in HTML
 * @param {string} content - Content with ^[footnote] syntax
 * @param {Array} footnotes - Array of footnotes for this page/chapter
 * @param {Function} onFootnoteClick - Callback when footnote is clicked
 * @returns {string} - HTML with footnotes replaced by superscript numbers
 */
export const renderFootnotesInContent = (content, footnotes = [], onFootnoteClick = null) => {
  if (!content) return '';
  
  // Create a map of footnote content to global number
  const footnoteMap = new Map();
  footnotes.forEach((fn, idx) => {
    // Match by content (since we're processing page by page)
    footnoteMap.set(fn.content.trim(), fn.globalNumber || (idx + 1));
  });
  
  // Replace ^[content] with superscript
  const footnoteRegex = /\^\[([^\]]+)\]/g;
  let footnoteCounter = 1; // Local counter for this page
  
  const html = content.replace(footnoteRegex, (match, footnoteContent) => {
    const trimmedContent = footnoteContent.trim();
    // Try to find global number, otherwise use local counter
    const globalNumber = footnoteMap.get(trimmedContent) || footnoteCounter++;
    
    const clickHandler = onFootnoteClick 
      ? `onclick="window.footnoteClickHandler && window.footnoteClickHandler(${globalNumber}); return false;"`
      : '';
    
    return `<sup class="footnote-ref" data-footnote-number="${globalNumber}" ${clickHandler}>${globalNumber}</sup>`;
  });
  
  return html;
};

/**
 * Generate HTML for footnotes section at bottom of page
 * @param {Array} footnotes - Array of footnotes for this page
 * @returns {string} - HTML for footnotes section
 */
export const renderFootnotesSection = (footnotes) => {
  if (!footnotes || footnotes.length === 0) return '';
  
  const footnotesHtml = footnotes
    .map((fn, idx) => {
      const number = fn.globalNumber || (idx + 1);
      return `
        <div class="footnote-item" id="footnote-${number}">
          <span class="footnote-number">${number}.</span>
          <span class="footnote-content">${fn.content}</span>
        </div>
      `;
    })
    .join('');
  
  return `
    <div class="footnotes-section">
      <div class="footnotes-divider"></div>
      <div class="footnotes-list">
        ${footnotesHtml}
      </div>
    </div>
  `;
};

/**
 * Generate content for acknowledgements chapter
 * @param {Array} allFootnotes - All footnotes from all chapters
 * @returns {string} - HTML content for acknowledgements chapter
 */
export const generateAcknowledgementsContent = (allFootnotes) => {
  if (!allFootnotes || allFootnotes.length === 0) {
    return '<p>No acknowledgements.</p>';
  }
  
  // Group by chapter for better organization
  const byChapter = {};
  allFootnotes.forEach((fn) => {
    const key = fn.subchapterId 
      ? `${fn.chapterId}-${fn.subchapterId}`
      : fn.chapterId;
    if (!byChapter[key]) {
      byChapter[key] = {
        chapterTitle: fn.chapterTitle,
        subchapterTitle: fn.subchapterTitle,
        footnotes: [],
      };
    }
    byChapter[key].footnotes.push(fn);
  });
  
  let html = '<div class="acknowledgements-content">';
  
  Object.values(byChapter).forEach((group) => {
    html += `<div class="acknowledgements-section">`;
    html += `<h3 class="acknowledgements-chapter-title">${group.chapterTitle}`;
    if (group.subchapterTitle) {
      html += `: ${group.subchapterTitle}`;
    }
    html += `</h3>`;
    
    group.footnotes.forEach((fn) => {
      html += `
        <div class="acknowledgement-item">
          <span class="acknowledgement-number">${fn.globalNumber}.</span>
          <span class="acknowledgement-content">${fn.content}</span>
        </div>
      `;
    });
    
    html += `</div>`;
  });
  
  html += '</div>';
  return html;
};

