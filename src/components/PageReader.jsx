const ensureWordSliceInitialized = (karaokeSourcesRef, karaokeId, sliceElement, startChar, endChar) => {
    if (!sliceElement || !sliceElement.isConnected) {
      console.warn('[[INIT]] Cannot initialize slice - not connected');
      return false;
    }

    if (sliceElement.querySelectorAll('.karaoke-word').length > 0) {
      return true;
    }

    const source = karaokeSourcesRef.current[karaokeId];
    if (!source) {
      console.warn('[[INIT]] Cannot initialize slice - no source found');
      return false;
    }

    const text = sliceElement.textContent || '';
    if (!text.trim()) {
      console.warn('[[INIT]] Cannot initialize slice - no text content');
      return false;
    }

    const fragment = document.createDocumentFragment();
    const wordMetadata = source.wordCharRanges || [];
    const sliceStart = startChar;
    const sliceEnd = typeof endChar === 'number' ? endChar : sliceStart + text.length;

    console.log('[[INIT]] Initializing slice with word-level highlighting', {
      karaokeId,
      sliceStart,
      sliceEnd,
      textLength: text.length,
      wordCount: wordMetadata.length,
    });

    let localCursor = 0;
    wordMetadata.forEach((word) => {
      if (!word) return;
      if (word.charEnd <= sliceStart || word.charStart >= sliceEnd) {
        return;
      }

      const localStart = Math.max(0, word.charStart - sliceStart);
      const localEnd = Math.min(text.length, word.charEnd - sliceStart);
      if (localEnd <= localStart) {
        return;
      }

      if (localStart > localCursor) {
        fragment.appendChild(document.createTextNode(text.slice(localCursor, localStart)));
        localCursor = localStart;
      }

      const wordText = text.slice(localStart, localEnd);
      const wordSpan = document.createElement('span');
      wordSpan.className = 'karaoke-word';
      wordSpan.dataset.wordIndex = String(word.wordIndex);
      if (typeof word.start === 'number') {
        wordSpan.dataset.start = String(word.start);
      }
      if (typeof word.end === 'number') {
        wordSpan.dataset.end = String(word.end);
      }
      wordSpan.dataset.word = wordText;

      Array.from(wordText).forEach((char) => {
        const charSpan = document.createElement('span');
        charSpan.className = 'karaoke-char';
        charSpan.textContent = char;
        charSpan.dataset.char = char === ' ' ? '\u00A0' : char;

        if (!/\s/.test(char) && !/[.,!?;:]/.test(char) && Math.random() < 0.35) {
          charSpan.dataset.ink = '1';
        }

        wordSpan.appendChild(charSpan);
      });

      fragment.appendChild(wordSpan);
      localCursor = localEnd;
    });

    if (localCursor < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(localCursor)));
    }

    sliceElement.innerHTML = '';
    sliceElement.appendChild(fragment);
    console.log('[[INIT]] Slice initialized successfully with words');
    return true;
  };
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { applyInkEffectToTextMobile } from './Chapter';
import { ReaderTopBar } from './ReaderTopBar';
import { MobileTOC } from './MobileTOC';
import './PageReader.css';

const PROJECT_CREDIT = 'Overstimulata Collective';

const normalizeWord = (value) => {
  if (!value) return '';
  return value
    .normalize('NFKD')
    .replace(/’/g, "'")
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9']+/g, '');
};

const tokenizeText = (text) => {
  const tokens = [];
  const TOKEN_REGEX = /[\p{L}\p{N}'’]+/gu;
  for (const match of text.matchAll(TOKEN_REGEX)) {
    const raw = match[0];
    const start = match.index ?? 0;
    const end = start + raw.length;
    const indices = [];
    for (let i = start; i < end; i += 1) {
      indices.push(i);
    }
    tokens.push({
      raw,
      start,
      end,
      indices,
      normalized: normalizeWord(raw),
    });
  }
  return tokens;
};

const assignLetterTimingsToChars = (text, wordTimings = []) => {
  const letterTimings = new Array(text.length).fill(null);
  const wordCharRanges = [];
  const tokens = tokenizeText(text);
  let tokenPointer = 0;

  wordTimings.forEach(({ word, start, end }) => {
    const normalizedWord = normalizeWord(word);
    if (!normalizedWord) {
      wordCharRanges.push(null);
      return;
    }

    let matchedToken = null;
    while (tokenPointer < tokens.length) {
      const candidate = tokens[tokenPointer];
      if (!candidate.normalized) {
        tokenPointer += 1;
        continue;
      }
      if (candidate.normalized === normalizedWord) {
        matchedToken = candidate;
        break;
      }
      tokenPointer += 1;
    }

    if (!matchedToken) {
      wordCharRanges.push(null);
      return;
    }

    const duration = Math.max((end ?? 0) - (start ?? 0), 0.001);
    const indices = matchedToken.indices;
    const spanLength = indices.length || 1;

    indices.forEach((idx, position) => {
      const ratioStart = position / spanLength;
      const ratioEnd = (position + 1) / spanLength;
      letterTimings[idx] = {
        start: (start ?? 0) + duration * ratioStart,
        end: (start ?? 0) + duration * ratioEnd,
      };
    });

    wordCharRanges.push({
      word,
      start,
      end,
      charStart: indices[0],
      charEnd: indices[indices.length - 1] + 1,
      wordIndex: wordCharRanges.length,
    });

    tokenPointer += 1;
  });

  return { letterTimings, wordCharRanges };
};


/**
 * PageReader component - Kindle-like page-based reading experience for mobile
 * Splits content into pages based on actual content height and handles navigation
 */
export const PageReader = ({ 
  chapters, 
  onPageChange, 
  initialPosition,
  onEditChapter,
  onAddSubchapter,
  onDeleteChapter,
  onEditSubchapter,
  onDeleteSubchapter,
  onReorderChapters,
  onOpenSettings,
  onAddChapter,
  onToggleEditorReader,
}) => {
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [pages, setPages] = useState([]);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [displayPage, setDisplayPage] = useState(null); // The page currently displayed
  const [isInitializing, setIsInitializing] = useState(true); // Track if we're still initializing
  const [isTOCOpen, setIsTOCOpen] = useState(false);
  const [tocDragProgress, setTocDragProgress] = useState(0); // 0 = fully closed, 1 = fully open
  const tocDragProgressRef = useRef(0); // Use ref to avoid re-renders during drag
  const tocDragStartYRef = useRef(null);
  const containerRef = useRef(null);
  const pageContainerRef = useRef(null);
  const touchStartRef = useRef(null);
  const touchCurrentRef = useRef(null);
  const swipeInProgressRef = useRef(false);
  const [karaokeSources, setKaraokeSources] = useState({});
  const karaokeSourcesRef = useRef({});
  useEffect(() => {
    karaokeSourcesRef.current = karaokeSources;
  }, [karaokeSources]);

  // Karaoke controller: manages playback across page slices
  const karaokeControllersRef = useRef(new Map()); // karaokeId -> controller
  const audioUnlockedRef = useRef(false);
  const currentKaraokeSliceRef = useRef(null); // { karaokeId, sliceElement, startChar, endChar }

  // Calculate pages for all chapters based on actual content height
  // Includes subchapters in the flow
  useEffect(() => {
    if (typeof window === 'undefined' || window.innerWidth > 768) return;
    if (!chapters || chapters.length === 0) {
      setPages([]);
      return;
    }

    // Don't recalculate if pages already exist (unless chapters changed)
    if (pages.length > 0) return;

    const calculatePages = async () => {
      const viewport = window.visualViewport;
      const viewportHeight = viewport ? viewport.height : window.innerHeight;
      const safeInsetTop = viewport ? viewport.offsetTop : 0;
      const safeInsetBottom = viewport
        ? Math.max(0, window.innerHeight - (viewport.height + viewport.offsetTop))
        : 0;
      
      const newPages = [];
      const newKaraokeSources = {};

      // Create measurement container that exactly matches rendered page structure
      // This ensures measurement accuracy by using the same CSS classes
      const createMeasureContainer = () => {
        const container = document.createElement('div');
        container.className = 'page-container';
        container.style.position = 'absolute';
        container.style.visibility = 'hidden';
        container.style.left = '-9999px';
        container.style.top = '0';
        container.style.width = '100%';
        container.style.height = viewportHeight + 'px';
        container.style.padding = '2rem 1.5rem 0.5rem';
        container.style.boxSizing = 'border-box';
        container.style.display = 'flex';
        container.style.alignItems = 'center';
        container.style.justifyContent = 'center';
        container.style.pointerEvents = 'none';

        const sheet = document.createElement('div');
        sheet.className = 'page-sheet content-page';
        sheet.style.width = 'min(660px, 94vw)';
        sheet.style.height = '100%';
        sheet.style.display = 'flex';
        sheet.style.flexDirection = 'column';
        sheet.style.alignItems = 'flex-start';
        container.appendChild(sheet);

        const body = document.createElement('section');
        body.className = 'page-body';
        body.style.width = '100%';
        body.style.flex = '1';
        body.style.overflow = 'hidden';
        sheet.appendChild(body);
        document.body.appendChild(container);

        return {
          container,
          sheet,
          body,
          destroy: () => container.remove(),
          setHeading: (hasHeading) => {
            sheet.classList.remove('page-with-heading', 'page-without-heading');
            sheet.classList.add(hasHeading ? 'page-with-heading' : 'page-without-heading');
            // Force reflow to apply CSS changes
            body.offsetHeight;
          },
          getAvailableHeight: () => {
            // Return actual available height from CSS-applied styles
            return body.clientHeight;
          },
        };
      };

      const measure = createMeasureContainer();

      // Process chapters sequentially
      for (let chapterIdx = 0; chapterIdx < chapters.length; chapterIdx++) {
        const chapter = chapters[chapterIdx];
        
        // Build content array: chapter content + all subchapter content
        const contentBlocks = [];
        const hasChapterContent = !!(chapter.contentHtml || chapter.content);
        
        if (hasChapterContent) {
          contentBlocks.push({
            type: 'chapter',
            title: chapter.title,
            content: chapter.contentHtml || chapter.content,
            chapterId: chapter.id,
            subchapterId: null,
          });
        }
        
        if (chapter.children && chapter.children.length > 0) {
          let isFirstSubchapter = true;
          chapter.children.forEach((subchapter) => {
            if (subchapter.contentHtml || subchapter.content) {
              contentBlocks.push({
                type: 'subchapter',
                title: subchapter.title,
                content: subchapter.contentHtml || subchapter.content,
                chapterId: chapter.id,
                subchapterId: subchapter.id,
                includeChapterTitle: !hasChapterContent && isFirstSubchapter, // Include chapter title if chapter has no content
              });
              isFirstSubchapter = false;
            }
          });
        }

        if (contentBlocks.length === 0) continue;

        let chapterPageIndex = 0;
        let currentPageElements = [];
        let pageHasHeading = false;

        const startNewPage = (initialHeading = false) => {
          currentPageElements = [];
          pageHasHeading = initialHeading;
          measure.body.innerHTML = '';
          measure.setHeading(initialHeading);
        };

        const pushPage = (blockMeta) => {
          if (!currentPageElements.length) return;
          newPages.push({
            chapterIndex: chapterIdx,
            chapterId: chapter.id,
            chapterTitle: chapter.title,
            subchapterId: blockMeta.subchapterId,
            subchapterTitle: blockMeta.type === 'subchapter' ? blockMeta.title : null,
            pageIndex: chapterPageIndex,
            hasHeading: pageHasHeading,
            content: currentPageElements.join(''),
          });
          chapterPageIndex += 1;
          startNewPage(false);
        };

        startNewPage(false);

        // Split text element at word boundaries while preserving HTML structure
        // Uses Range API to find the split point that preserves formatting
        function splitTextAtWordBoundary(element, maxHeight, options = {}) {
          const { returnCharCount = false } = options;
          const fullText = element.textContent || '';
          if (!fullText.trim()) {
            return {
              first: element.outerHTML,
              second: null,
              firstCharCount: returnCharCount ? fullText.length : undefined,
            };
          }

          // Get all text nodes with their positions
          const textNodes = [];
          const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            null
          );
          let node;
          while (node = walker.nextNode()) {
            if (node.textContent.trim()) {
              textNodes.push(node);
            }
          }

          if (textNodes.length === 0) {
            return {
              first: element.outerHTML,
              second: null,
              firstCharCount: returnCharCount ? fullText.length : undefined,
            };
          }

          // Binary search to find split point
          let low = 0;
          let high = fullText.length;
          let bestSplit = 0;

          while (low < high) {
            const mid = Math.floor((low + high) / 2);
            
            // Create range to get text up to mid position
            const range = document.createRange();
            range.setStart(element, 0);
            
            // Find character position across all text nodes
            let charCount = 0;
            let found = false;
            for (const textNode of textNodes) {
              const nodeLength = textNode.textContent.length;
              if (charCount + nodeLength >= mid) {
                const offset = mid - charCount;
                // Find word boundary near this position
                const text = textNode.textContent;
                let wordBoundary = offset;
                
                // Move to nearest word boundary (space or start of word)
                while (wordBoundary < text.length && !/\s/.test(text[wordBoundary])) {
                  wordBoundary++;
                }
                if (wordBoundary === text.length && wordBoundary > 0) {
                  // Move back to previous space
                  while (wordBoundary > 0 && !/\s/.test(text[wordBoundary - 1])) {
                    wordBoundary--;
                  }
                }

                // Avoid breaking immediately after punctuation like ",", ".", "?" etc.
                // If the candidate break is right after punctuation, look for an earlier space.
                if (
                  wordBoundary > 0 &&
                  /[,\.;:!?]/.test(text[wordBoundary - 1])
                ) {
                  let safeBoundary = wordBoundary - 1;
                  while (
                    safeBoundary > 0 &&
                    (!/\s/.test(text[safeBoundary]) ||
                      /[,\.;:!?]/.test(text[safeBoundary - 1]))
                  ) {
                    safeBoundary--;
                  }
                  if (safeBoundary > 0 && /\s/.test(text[safeBoundary])) {
                    wordBoundary = safeBoundary;
                  }
                }
                
                range.setEnd(textNode, wordBoundary);
                found = true;
                break;
              }
              charCount += nodeLength;
            }
            
            if (!found) {
              range.setEnd(element, element.childNodes.length);
            }

            // Create clone with content up to range
            const clone = element.cloneNode(true);
            const cloneRange = range.cloneContents();
            clone.innerHTML = '';
            clone.appendChild(cloneRange);
            
            measure.body.appendChild(clone);
            const height = measure.body.scrollHeight;
            measure.body.removeChild(clone);
            
            if (height <= maxHeight + 2) {
              bestSplit = mid;
              low = mid + 1;
            } else {
              high = mid;
            }
          }

          if (bestSplit === 0) {
            return {
              first: null,
              second: element.outerHTML,
              firstCharCount: returnCharCount ? 0 : undefined,
            };
          }
          
          // Check if entire element fits
          const fullClone = element.cloneNode(true);
          measure.body.appendChild(fullClone);
          const fullHeight = measure.body.scrollHeight;
          measure.body.removeChild(fullClone);
          
          if (fullHeight <= maxHeight + 2) {
            return {
              first: element.outerHTML,
              second: null,
              firstCharCount: returnCharCount ? fullText.length : undefined,
            };
          }

          // Create the split using Range API
          const range = document.createRange();
          range.setStart(element, 0);
          
          // Find the actual split point at word boundary
          let charCount = 0;
          let splitFound = false;
          for (const textNode of textNodes) {
            const nodeLength = textNode.textContent.length;
            if (charCount + nodeLength >= bestSplit) {
              const offset = bestSplit - charCount;
              const text = textNode.textContent;
              let wordBoundary = offset;
              
              // Find nearest word boundary (prefer space before current position)
              while (wordBoundary > 0 && !/\s/.test(text[wordBoundary - 1])) {
                wordBoundary--;
              }
              if (wordBoundary === 0 && offset < text.length) {
                // If at start, find next space
                while (wordBoundary < text.length && !/\s/.test(text[wordBoundary])) {
                  wordBoundary++;
                }
              }

              // Avoid breaking immediately after punctuation; prefer an earlier space.
              if (
                wordBoundary > 0 &&
                /[,\.;:!?]/.test(text[wordBoundary - 1])
              ) {
                let safeBoundary = wordBoundary - 1;
                while (
                  safeBoundary > 0 &&
                  (!/\s/.test(text[safeBoundary]) ||
                    /[,\.;:!?]/.test(text[safeBoundary - 1]))
                ) {
                  safeBoundary--;
                }
                if (safeBoundary > 0 && /\s/.test(text[safeBoundary])) {
                  wordBoundary = safeBoundary;
                }
              }
              
              range.setEnd(textNode, wordBoundary);
              splitFound = true;
              break;
            }
            charCount += nodeLength;
          }
          
          if (!splitFound) {
            return {
              first: element.outerHTML,
              second: null,
              firstCharCount: returnCharCount ? fullText.length : undefined,
            };
          }

          // Extract first and second parts
          const firstPart = element.cloneNode(true);
          firstPart.innerHTML = '';
          firstPart.appendChild(range.cloneContents());
          
          const secondPart = element.cloneNode(true);
          secondPart.innerHTML = '';
          const secondRange = document.createRange();
          secondRange.setStart(range.endContainer, range.endOffset);
          secondRange.setEnd(element, element.childNodes.length);
          secondPart.appendChild(secondRange.cloneContents());

          // Calculate character count for first part
          const firstCharCount = returnCharCount ? bestSplit : undefined;

          return {
            first: firstPart.outerHTML,
            second: secondPart.outerHTML,
            firstCharCount,
          };
        }

        const handleKaraokeElement = (element, blockMeta) => {
          const dataAttr = element.getAttribute('data-karaoke');
          if (!dataAttr) return false;
          let karaokeData;
          try {
            let parsed = dataAttr;
            try {
              parsed = decodeURIComponent(dataAttr);
            } catch {
              // ignore decode errors, fallback to raw JSON
            }
            karaokeData = typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
          } catch {
            return false;
          }

          const fullText = karaokeData?.text || element.textContent || '';
          if (!fullText.trim()) {
            return false;
          }

          const karaokeId =
            element.getAttribute('data-karaoke-id') ||
            `karaoke-${chapterIdx}-${blockMeta?.subchapterId || blockMeta?.chapterId}-${Date.now()}`;

          if (!newKaraokeSources[karaokeId]) {
            const { letterTimings, wordCharRanges } = assignLetterTimingsToChars(
              karaokeData.text || '',
              karaokeData.wordTimings || []
            );
            newKaraokeSources[karaokeId] = {
              ...karaokeData,
              letterTimings,
              wordCharRanges,
              text: karaokeData.text || '',
            };
          }

          let cursor = 0;
          while (cursor < fullText.length) {
            const availableHeight = measure.getAvailableHeight();
            const remainingText = fullText.slice(cursor);

            const tempElement = document.createElement('div');
            tempElement.className = 'karaoke-slice-measure';
            tempElement.style.display = 'block';
            tempElement.style.whiteSpace = 'pre-wrap';
            tempElement.style.margin = '0 0 0.85rem';
            tempElement.textContent = remainingText;

            const { firstCharCount } = splitTextAtWordBoundary(tempElement, availableHeight, {
              returnCharCount: true,
            });

            let charsToUse = firstCharCount || 0;
            if (charsToUse === 0) {
              if (currentPageElements.length > 0) {
                pushPage(blockMeta);
                startNewPage(false);
                continue;
              }
              // Force minimal chunk (should be rare)
              charsToUse = Math.min(remainingText.length, 80);
            }

            const sliceText = fullText.slice(cursor, cursor + charsToUse);
            const sliceEl = document.createElement('span');
            sliceEl.className = 'karaoke-slice';
            sliceEl.dataset.karaokeId = karaokeId;
            sliceEl.dataset.karaokeStart = String(cursor);
            sliceEl.dataset.karaokeEnd = String(cursor + charsToUse);
            sliceEl.textContent = sliceText;

            const measureNode = sliceEl.cloneNode(true);
            measure.body.appendChild(measureNode);
            currentPageElements.push(sliceEl.outerHTML);

            cursor += charsToUse;
            if (cursor < fullText.length) {
              pushPage(blockMeta);
              startNewPage(false);
            }
          }

          return true;
        };

        for (let blockIdx = 0; blockIdx < contentBlocks.length; blockIdx++) {
          const block = contentBlocks[blockIdx];
          
          const tempContainer = document.createElement('div');
          tempContainer.style.position = 'absolute';
          tempContainer.style.visibility = 'hidden';
          tempContainer.style.width = '90vw';
          tempContainer.style.padding = '1rem';
          tempContainer.style.top = '-9999px';
          tempContainer.style.left = '-9999px';
          document.body.appendChild(tempContainer);

          const contentDiv = document.createElement('div');
          contentDiv.className = 'chapter-content';
          contentDiv.style.fontFamily = "'Times New Roman', 'Times', 'Garamond', 'Baskerville', 'Caslon', 'Hoefler Text', 'Minion Pro', 'Palatino', 'Georgia', serif";
          contentDiv.style.fontSize = '1.18rem'; // Match .page-body font-size
          contentDiv.style.lineHeight = '1.62'; // Match .page-body line-height
          contentDiv.style.color = '#0a0a0a';
          
          let htmlContent = block.content;
          
          // Replace long dashes with short hyphens
          // Replace em dash (—) and en dash (–) with regular hyphen (-)
          htmlContent = htmlContent.replace(/—/g, '-').replace(/–/g, '-');
          
          // Handle title rendering
          if (block.includeChapterTitle) {
            // Chapter has no content, so include both chapter and subchapter titles
            const chapterTitle = chapters[chapterIdx].title;
            htmlContent = `<h3 class="chapter-header-title">${chapterTitle}</h3><h4 class="chapter-header-title">${block.title}</h4>${htmlContent}`;
          } else if (block.type === 'subchapter' || (block.type === 'chapter' && blockIdx === 0)) {
            // Normal case: add title for first block or subchapter
            const titleTag = block.type === 'subchapter' ? 'h4' : 'h3';
            htmlContent = `<${titleTag} class="chapter-header-title">${block.title}</${titleTag}>${htmlContent}`;
          }
          
          contentDiv.innerHTML = htmlContent;
          tempContainer.appendChild(contentDiv);

          await new Promise((resolve) => {
            const images = contentDiv.querySelectorAll('img');
            if (images.length === 0) {
              requestAnimationFrame(() => {
                requestAnimationFrame(() => resolve());
              });
            } else {
              let loaded = 0;
              const checkComplete = () => {
                loaded++;
                if (loaded === images.length) {
                  requestAnimationFrame(() => {
                    requestAnimationFrame(() => resolve());
                  });
                }
              };
              images.forEach((img) => {
                if (img.complete) {
                  checkComplete();
                } else {
                  img.onload = checkComplete;
                  img.onerror = checkComplete;
                }
              });
            }
          });

          const elements = Array.from(contentDiv.children);

          // Check if element is atomic (cannot be split): images, videos, headings, karaoke
          const isAtomicElement = (element) => {
            const tagName = element.tagName?.toLowerCase();
            // Atomic elements: images, videos, headings
            if (['img', 'video', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
              return true;
            }
            // Karaoke blocks
            if (element.classList.contains('karaoke') || element.hasAttribute('data-karaoke')) {
              return true;
            }
            // Elements containing atomic children
            if (element.querySelector('img, video, [data-karaoke], .karaoke')) {
              return true;
            }
            return false;
          };

          // Main pagination loop: process each element
          for (const element of elements) {
            const isHeadingElement = /^H[1-6]$/i.test(element.tagName || '');
            
            // Update heading state if needed (affects available height)
            if (isHeadingElement && !pageHasHeading) {
              pageHasHeading = true;
              measure.setHeading(true);
            }

            if (
              element.classList?.contains('karaoke-object') ||
              element.hasAttribute?.('data-karaoke') ||
              element.querySelector?.('.karaoke-object')
            ) {
              if (handleKaraokeElement(element, block)) {
                continue;
              }
            }

            // Get current available height based on page state
            const availableHeight = measure.getAvailableHeight();

            // Check if element is atomic (cannot be split)
            if (isAtomicElement(element)) {
              // Atomic element: try to add it, split page if needed
              const clone = element.cloneNode(true);
              measure.body.appendChild(clone);
              const scrollHeight = measure.body.scrollHeight;
              
              if (scrollHeight > availableHeight + 2) {
                // Element overflows - finalize current page and start new one
                measure.body.removeChild(clone);

                if (currentPageElements.length > 0) {
                  pushPage(block);
                }

                // Start new page with this atomic element
                startNewPage(isHeadingElement);
                measure.body.appendChild(clone);
                currentPageElements.push(element.outerHTML);
              } else {
                // Element fits - keep it on current page
                currentPageElements.push(element.outerHTML);
              }
            } else {
              // Splittable text element: try to keep paragraph intact, split if needed
              const clone = element.cloneNode(true);
              measure.body.appendChild(clone);
              const scrollHeight = measure.body.scrollHeight;
              
              if (scrollHeight > availableHeight + 2) {
                // Element overflows - try to split at word boundary
                measure.body.removeChild(clone);
                
                const { first, second } = splitTextAtWordBoundary(element, availableHeight);
                
                if (first) {
                  // Add first part to current page
                  const tempDiv = document.createElement('div');
                  tempDiv.innerHTML = first;
                  measure.body.appendChild(tempDiv.firstElementChild);
                  currentPageElements.push(first);
                  
                  // Finalize current page
                  if (currentPageElements.length > 0) {
                    pushPage(block);
                  }
                  
                  // Start new page with second part
                  startNewPage(false);
                  
                  if (second) {
                    const tempDiv2 = document.createElement('div');
                    tempDiv2.innerHTML = second;
                    measure.body.appendChild(tempDiv2.firstElementChild);
                    currentPageElements.push(second);
                  }
                } else {
                  // Can't fit even part of it - move entire element to next page
                  if (currentPageElements.length > 0) {
                    pushPage(block);
                  }
                  startNewPage(false);
                  
                  measure.body.appendChild(clone);
                  currentPageElements.push(element.outerHTML);
                }
              } else {
                // Element fits entirely - keep it on current page
                currentPageElements.push(element.outerHTML);
              }
            }
          }

          pushPage(block);

          document.body.removeChild(tempContainer);
        }
      }

      measure.destroy();

      // Update totalPages for each chapter
      const pagesByChapter = {};
      newPages.forEach(page => {
        const key = `${page.chapterIndex}`;
        if (!pagesByChapter[key]) pagesByChapter[key] = [];
        pagesByChapter[key].push(page);
      });
      
      newPages.forEach(page => {
        const key = `${page.chapterIndex}`;
        page.totalPages = pagesByChapter[key]?.length || 1;
      });

      setPages(newPages);
      setKaraokeSources(newKaraokeSources);
      
      // Restore initial position immediately when pages are calculated
      if (newPages.length > 0) {
        if (initialPosition) {
          const { chapterId, pageIndex } = initialPosition;
          const page = newPages.find(
            (p) => p.chapterId === chapterId && p.pageIndex === (pageIndex || 0)
          );
          if (page) {
            setCurrentChapterIndex(page.chapterIndex);
            setCurrentPageIndex(page.pageIndex);
          } else {
            // Fallback to first page if saved position not found
            setCurrentChapterIndex(0);
            setCurrentPageIndex(0);
          }
        } else {
          // No saved position, start at first page
          setCurrentChapterIndex(0);
          setCurrentPageIndex(0);
        }
        // Mark initialization as complete
        setIsInitializing(false);
      }
    };

    // Delay to ensure DOM is ready
    const timer = setTimeout(() => {
      calculatePages();
    }, 200);

    return () => {
      clearTimeout(timer);
    };
  }, [chapters, initialPosition, pages.length]);

  // Position restoration is now handled in the page calculation effect
  // to ensure it happens immediately when pages are ready

  // Unlock audio context on first user interaction
  const unlockAudioContext = useCallback(async () => {
    if (audioUnlockedRef.current) {
      console.log('Audio already unlocked');
      return;
    }
    
    console.log('Unlocking audio context...');
    
    // Try multiple methods to unlock audio
    let unlocked = false;
    
    // Method 1: Try with a dummy audio element
    try {
      const dummyAudio = new Audio();
      dummyAudio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
      dummyAudio.volume = 0;
      dummyAudio.preload = 'auto';
      
      console.log('Attempting to play dummy audio...');
      const playPromise = dummyAudio.play();
      if (playPromise !== undefined) {
        // Add timeout to prevent hanging
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Play timeout')), 1000);
        });
        
        try {
          await Promise.race([playPromise, timeoutPromise]);
          console.log('Dummy audio played successfully');
          dummyAudio.pause();
          dummyAudio.currentTime = 0;
          unlocked = true;
        } catch (playErr) {
          console.warn('Dummy audio play failed or timed out', playErr);
          // Try to pause anyway
          try {
            dummyAudio.pause();
          } catch {}
        }
      } else {
        console.log('play() returned undefined, assuming success');
        unlocked = true;
      }
    } catch (err) {
      console.warn('Dummy audio method failed', err);
    }
    
    // Method 2: Try with AudioContext (more reliable)
    if (!unlocked) {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
          const ctx = new AudioContext();
          if (ctx.state === 'suspended') {
            await ctx.resume();
            console.log('AudioContext resumed');
          }
          unlocked = true;
        }
      } catch (err) {
        console.warn('AudioContext method failed', err);
      }
    }
    
    // Always mark as unlocked after user gesture - the actual audio.play() will handle any restrictions
    // The user gesture (swipe) is the key requirement, not the dummy audio
    audioUnlockedRef.current = true;
    console.log('Audio marked as unlocked (user gesture detected)');
    window.dispatchEvent(new CustomEvent('audioUnlocked'));
    console.log('audioUnlocked event dispatched');
  }, []);

  // Get or create karaoke controller for a given karaokeId
  const getKaraokeController = useCallback((karaokeId) => {
    if (karaokeControllersRef.current.has(karaokeId)) {
      return karaokeControllersRef.current.get(karaokeId);
    }

    const source = karaokeSourcesRef.current[karaokeId];
    if (!source) return null;

    const audio = new Audio(source.audioUrl);
    audio.preload = 'auto';
    audio.crossOrigin = 'anonymous';

    let rafId = null;
    let currentSlice = null;

    const cancelAnimation = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };

    const updateHighlighting = () => {
      if (!currentSlice) return;
      const { sliceElement, startChar, letterTimings } = currentSlice;
      if (!sliceElement || !sliceElement.isConnected) return;

      const current = audio.currentTime;
      const chars = Array.from(sliceElement.textContent || '');
      
      chars.forEach((char, localIdx) => {
        const globalIdx = startChar + localIdx;
        const timing = letterTimings[globalIdx];
        if (!timing) return;

        const span = sliceElement.childNodes[localIdx];
        if (!span || span.nodeType !== Node.TEXT_NODE) return;

        // For text nodes, we need to wrap them in spans for highlighting
        // This will be done during initialization
      });
    };

    const step = () => {
      if (!currentSlice) {
        cancelAnimation();
        return;
      }

      const { sliceElement, startChar, endChar } = currentSlice;
      if (!sliceElement || !sliceElement.isConnected) {
        cancelAnimation();
        return;
      }

      const current = audio.currentTime;
      const wordMetadata = source?.wordCharRanges || [];
      
      // Update highlighting for words in this slice
      let wordSpans = sliceElement.querySelectorAll('.karaoke-word');
      
      // Debug: log first few times to verify loop is running
      if (!currentSlice._stepCount) {
        currentSlice._stepCount = 0;
      }
      currentSlice._stepCount++;
      
      if (currentSlice._stepCount <= 3 || currentSlice._stepCount % 60 === 0) {
        console.log('Step function running (word-level)', { 
          stepCount: currentSlice._stepCount,
          wordSpanCount: wordSpans.length, 
          startChar, 
          endChar, 
          currentTime: current,
          audioPlaying: !audio.paused,
          audioReadyState: audio.readyState
        });
      }
      
      if (wordSpans.length === 0) {
        if (!currentSlice._loggedNoSpans) {
          console.warn('No karaoke-word spans found in slice!', {
            sliceElement: sliceElement,
            sliceHTML: sliceElement.innerHTML.substring(0, 100),
            hasChildren: sliceElement.children.length
          });
          currentSlice._loggedNoSpans = true;
        }
        
        // If this is early in playback (first 10 frames), try to re-initialize the slice
        if (currentSlice._stepCount <= 10 && sliceElement && sliceElement.isConnected) {
          // Try to initialize the slice one more time
          const wasInitialized = ensureWordSliceInitialized(karaokeSourcesRef, karaokeId, sliceElement, startChar, endChar);
          if (wasInitialized) {
            console.log('[[STEP]] Re-initialized slice on frame', currentSlice._stepCount);
            // Re-query spans after initialization
            const newSpans = sliceElement.querySelectorAll('.karaoke-word');
            if (newSpans.length > 0) {
              // Continue with the new spans
              wordSpans = newSpans;
              currentSlice._loggedNoSpans = false; // Reset so we can log again if needed
            }
          }
        }
        
        // If still no spans, continue the loop in case they appear later
        if (wordSpans.length === 0) {
          rafId = requestAnimationFrame(step);
          return;
        }
      }
      
      wordSpans.forEach((span) => {
        const wordIndex = parseInt(span.dataset.wordIndex ?? '-1', 10);
        if (wordIndex < 0) return;
        
        // If we're resuming mid-slice, skip words before resumeWordIndex (mark them as complete)
        const resumeWordIndex = currentSlice.resumeWordIndex;
        if (typeof resumeWordIndex === 'number' && wordIndex < resumeWordIndex) {
          span.classList.add('karaoke-word-complete');
          span.classList.remove('karaoke-word-active');
          span.style.setProperty('--karaoke-fill', '1');
          return;
        }
        
        const startStr = span.dataset.start;
        const endStr = span.dataset.end;
        if (!startStr || !endStr) {
          return;
        }

        const start = parseFloat(startStr);
        const end = parseFloat(endStr);
        if (Number.isNaN(start) || Number.isNaN(end)) {
          return;
        }

        if (current >= end) {
          span.classList.add('karaoke-word-complete');
          span.classList.remove('karaoke-word-active');
          span.style.setProperty('--karaoke-fill', '1');
        } else if (current >= start) {
          const duration = Math.max(end - start, 0.001);
          const progress = Math.min(Math.max((current - start) / duration, 0), 1);
          span.classList.add('karaoke-word-active');
          span.classList.remove('karaoke-word-complete');
          span.style.setProperty('--karaoke-fill', progress.toFixed(3));
        } else {
          span.classList.remove('karaoke-word-active', 'karaoke-word-complete');
          span.style.setProperty('--karaoke-fill', '0');
        }
      });

      // If we're resuming and have passed the resume point, clear the waiting flag
      if (typeof currentSlice.resumeWordIndex === 'number' && controller.waitingForNextPage) {
        const resumeWord = wordMetadata[currentSlice.resumeWordIndex];
        if (resumeWord && typeof resumeWord.start === 'number' && current >= resumeWord.start) {
          // We've passed the resume point, clear the waiting flag
          controller.waitingForNextPage = false;
          controller.resumeWordIndex = null;
          controller.resumeTime = null;
          console.log('[[RESUME]] Cleared waitingForNextPage - passed resume point', {
            resumeWordIndex: currentSlice.resumeWordIndex,
            currentTime: current,
            resumeWordStart: resumeWord.start,
          });
        }
      }

      // After updating spans, detect if we've reached the end of this slice
      // If there is more text beyond this slice, we pause and wait for the next page-frame
      const fullTextLength = source?.text ? source.text.length : 0;
      const hasMoreTextBeyondSlice = fullTextLength > 0 && endChar < fullTextLength;

      if (hasMoreTextBeyondSlice && wordSpans.length > 0) {
        const lastSpan = wordSpans[wordSpans.length - 1];
        const lastWordIndex = parseInt(lastSpan.dataset.wordIndex ?? '-1', 10);
        const lastWord = lastWordIndex >= 0 ? wordMetadata[lastWordIndex] : null;
        if (lastWord && typeof lastWord.end === 'number') {
          const sliceEnded = current >= lastWord.end;
          if (sliceEnded && !controller.waitingForNextPage) {
            let nextWordIndex = lastWordIndex + 1;
            let nextWord = null;
            while (nextWordIndex < wordMetadata.length) {
              const candidate = wordMetadata[nextWordIndex];
              if (candidate && typeof candidate.start === 'number') {
                nextWord = candidate;
                break;
              }
              nextWordIndex += 1;
            }

            controller.resumeWordIndex = nextWord ? nextWord.wordIndex : lastWord.wordIndex;
            controller.resumeTime = nextWord
              ? nextWord.start
              : lastWord.end + 0.01;
            controller.waitingForNextPage = true;
            console.log('[[PAGE END]] Karaoke slice reached page end, pausing for next page', {
              karaokeId,
              sliceStartChar: startChar,
              sliceEndChar: endChar,
              lastWordIndex,
              nextWordIndex: nextWord ? nextWord.wordIndex : null,
              resumeWordIndex: controller.resumeWordIndex,
              resumeTime: controller.resumeTime,
              currentTime: current,
            });
            audio.pause();
            cancelAnimation();
            return;
          }
        }
      }

      rafId = requestAnimationFrame(step);
    };

    // Reset highlighting for all slices of this karaoke block
    const resetHighlighting = (sliceElement = null) => {
      // If a specific slice is provided, reset only that slice
      if (sliceElement) {
        const wordSpans = sliceElement.querySelectorAll('.karaoke-word');
        wordSpans.forEach((span) => {
          span.classList.remove('karaoke-word-active', 'karaoke-word-complete');
          span.style.setProperty('--karaoke-fill', '0');
        });
        return;
      }

      // Otherwise, reset all slices for this karaoke block
      const allSlices = document.querySelectorAll(`[data-karaoke-id="${karaokeId}"].karaoke-slice`);
      allSlices.forEach((slice) => {
        const wordSpans = slice.querySelectorAll('.karaoke-word');
        wordSpans.forEach((span) => {
          span.classList.remove('karaoke-word-active', 'karaoke-word-complete');
          span.style.setProperty('--karaoke-fill', '0');
        });
      });
    };

    // Handle audio ended event - reset highlighting and clear resume state
    audio.addEventListener('ended', () => {
      console.log('[[ENDED]] Audio finished, resetting highlighting and state', { karaokeId });
      resetHighlighting();
      cancelAnimation();
      currentSlice = null;
      controller.resumeWordIndex = null;
      controller.resumeTime = null;
      controller.waitingForNextPage = false;
      // Remove playing attribute from all slices of this karaoke
      const allSlices = document.querySelectorAll(`[data-karaoke-id="${karaokeId}"].karaoke-slice`);
      allSlices.forEach((slice) => {
        slice.removeAttribute('data-playing');
      });
    });

    const controller = {
      audio,
      // State for cross-page pause & resume
      resumeWordIndex: null,
      resumeTime: null,
      waitingForNextPage: false,

      playSlice: async (sliceElement, startChar, endChar, options = {}) => {
        console.log('[[PLAY]] playSlice called', {
          karaokeId,
          startChar,
          endChar,
          resumeWordIndex: options.resumeWordIndex,
          resumeTime: options.resumeTime,
          audioUnlocked: audioUnlockedRef.current,
        });
        const source = karaokeSourcesRef.current[karaokeId];
        if (!source) {
          console.log('No source found for karaokeId', karaokeId);
          return;
        }

        // Set playing attribute immediately to stop breathing animation
        sliceElement.setAttribute('data-playing', 'true');
        const allSlices = document.querySelectorAll(`[data-karaoke-id="${karaokeId}"].karaoke-slice`);
        allSlices.forEach((slice) => {
          if (slice !== sliceElement) {
            slice.removeAttribute('data-playing');
          }
        });

        // Check if slice is already initialized (has spans)
        const hasSpans = sliceElement.querySelectorAll('.karaoke-word').length > 0;
        if (!hasSpans) {
          // Only initialize if not already initialized
        if (!ensureWordSliceInitialized(karaokeSourcesRef, karaokeId, sliceElement, startChar, endChar)) {
            console.warn('[[PLAY]] Failed to initialize slice, cannot start playback');
            sliceElement.removeAttribute('data-playing'); // Remove if failed
            return;
          }
        } else {
          console.log('[[PLAY]] Slice already initialized, skipping initialization');
        }

        // Stop current playback
        audio.pause();
        cancelAnimation();

        // If we're starting from the beginning (not resuming), reset highlighting for all slices
        const isResuming = typeof options.resumeWordIndex === 'number' || typeof options.resumeTime === 'number';
        if (!isResuming) {
          console.log('[[PLAY]] Starting from beginning, resetting highlighting for all slices');
          resetHighlighting(); // Reset all slices, not just this one
          controller.resumeWordIndex = null;
          controller.resumeTime = null;
        }

        // Calculate start time
        const letterTimings = source.letterTimings || [];
        const wordMetadata = source.wordCharRanges || [];
        let startTime;

        if (typeof options.resumeTime === 'number') {
          // Prefer an exact resumeTime if we have it
          startTime = options.resumeTime;
        } else if (typeof options.resumeWordIndex === 'number') {
          const resumeWord = wordMetadata[options.resumeWordIndex];
          startTime =
            resumeWord && typeof resumeWord.start === 'number'
              ? resumeWord.start
              : 0;
        } else {
          const startTiming = letterTimings[startChar];
          startTime = startTiming ? startTiming.start : 0;
        }

        console.log('[[PLAY]] Starting playback at time', startTime);

        currentSlice = {
          sliceElement,
          startChar,
          endChar,
          letterTimings,
          resumeWordIndex: options.resumeWordIndex,
          _stepCount: 0,
          _loggedSpans: false,
          _loggedMissingTiming: false,
          _loggedNoSpans: false,
        };

        try {
          audio.currentTime = startTime;
          console.log('[[PLAY]] Calling audio.play() at time', startTime);
          await audio.play();
          console.log('[[PLAY]] Audio playing successfully, starting animation loop');
          
          // Clear processing flag now that playback has started
          sliceElement.dataset.processing = 'false';
          
          // Don't clear waitingForNextPage here - keep it until we've actually progressed past resume point
          // The resumeWordIndex/resumeTime will be used for highlighting, and we'll clear waitingForNextPage
          // in the step function once we've passed the resume point
          
          // Start animation loop - it will handle missing spans gracefully
          cancelAnimation();
          rafId = requestAnimationFrame(step);
          console.log('Animation loop started, rafId:', rafId, 'wordSpans:', sliceElement.querySelectorAll('.karaoke-word').length);
        } catch (err) {
          console.error('Karaoke playback failed', err);
          // Remove playing attribute if playback failed so breathing animation resumes
          sliceElement.removeAttribute('data-playing');
          // Clear processing flag
          sliceElement.dataset.processing = 'false';
          // The error might be due to browser restrictions, but we've already had a user gesture
          // so we'll log it but not retry - the user can tap the karaoke to start it
        }
      },
      pause: () => {
        audio.pause();
        cancelAnimation();
      },
      stop: () => {
        audio.pause();
        audio.currentTime = 0;
        cancelAnimation();
        currentSlice = null;
        controller.resumeWordIndex = null;
        controller.resumeTime = null;
        controller.waitingForNextPage = false;
      },
      cleanup: () => {
        audio.pause();
        audio.src = '';
        cancelAnimation();
        currentSlice = null;
        controller.resumeWordIndex = null;
        controller.resumeTime = null;
        controller.waitingForNextPage = false;
      },
    };

    karaokeControllersRef.current.set(karaokeId, controller);
    return controller;
  }, []);

  // Initialize karaoke slices on a page
  const initializeKaraokeSlices = useCallback((pageContentElement) => {
    if (!pageContentElement) return;

    const slices = pageContentElement.querySelectorAll('.karaoke-slice');
    console.log('[[INIT]] initializeKaraokeSlices called', {
      totalSlices: slices.length,
      elementConnected: pageContentElement.isConnected,
    });
    
    slices.forEach((slice) => {
      // Only process slices that are actually connected to the DOM
      if (!slice.isConnected) {
        console.log('[[INIT]] Skipping disconnected slice', {
          startChar: slice.getAttribute('data-karaoke-start'),
          endChar: slice.getAttribute('data-karaoke-end'),
        });
        return;
      }

      const karaokeId = slice.getAttribute('data-karaoke-id');
      const startChar = parseInt(slice.getAttribute('data-karaoke-start') || '0', 10);
      const endChar = parseInt(slice.getAttribute('data-karaoke-end') || '0', 10);

      if (!karaokeId) return;

      // Initialize slice if not already initialized (has karaoke-word spans)
      const isInitialized = slice.querySelectorAll('.karaoke-word').length > 0;
      if (!isInitialized) {
        const initialized = ensureWordSliceInitialized(karaokeSourcesRef, karaokeId, slice, startChar, endChar);
        if (!initialized) {
          return;
        }
      } else {
        console.log('[[INIT]] Skipping already-initialized slice', {
          startChar: slice.getAttribute('data-karaoke-start'),
          endChar: slice.getAttribute('data-karaoke-end'),
        });
      }

      // Add touch/click handler to start playback on tap (always, even if already initialized)
      if (!slice.dataset.clickHandlerAdded) {
        slice.dataset.clickHandlerAdded = 'true';
        
        // Use touchend for mobile, click for desktop
        const handleInteraction = (e) => {
          e.stopPropagation(); // Prevent swipe from triggering
          e.preventDefault(); // Prevent any default behavior

          const karaokeId = slice.getAttribute('data-karaoke-id');
          const startChar = parseInt(slice.getAttribute('data-karaoke-start') || '0', 10);
          const endChar = parseInt(slice.getAttribute('data-karaoke-end') || '0', 10);
          
          console.log('Karaoke slice clicked', { karaokeId, startChar, endChar });
          
          // Prevent multiple simultaneous clicks
          if (slice.dataset.processing === 'true') {
            console.log('Already processing click, ignoring');
            return;
          }
          slice.dataset.processing = 'true';
          
          // Clear processing flag after a short delay
          setTimeout(() => {
            slice.dataset.processing = 'false';
          }, 500);
          
          if (karaokeId) {
            // Ensure slice is initialized BEFORE doing anything else
            if (slice.querySelectorAll('.karaoke-word').length === 0) {
              console.log('Slice not initialized in click handler, initializing now...');
              const initialized = ensureWordSliceInitialized(karaokeSourcesRef, karaokeId, slice, startChar, endChar);
              if (!initialized) {
                console.error('Failed to initialize slice in click handler');
                return;
              }
            }
            
            const controller = getKaraokeController(karaokeId);
            if (controller && controller.audio) {
              // Unlock audio by playing the actual karaoke audio (best gesture context)
              if (!audioUnlockedRef.current) {
                console.log('Unlocking audio via karaoke click...');
                controller.audio.play().then(() => {
                  controller.audio.pause();
                  controller.audio.currentTime = 0;
                  audioUnlockedRef.current = true;
                  console.log('Audio unlocked via karaoke click');
                  window.dispatchEvent(new CustomEvent('audioUnlocked'));
                  // Now start playback from this slice, clearing any pending resume
                  karaokeControllersRef.current.forEach((ctrl, id) => {
                    if (id !== karaokeId) {
                      ctrl.pause();
                    }
                  });
                  controller.resumeWordIndex = null;
                  controller.resumeTime = null;
                  controller.waitingForNextPage = false;
                  controller.playSlice(slice, startChar, endChar);
                  currentKaraokeSliceRef.current = { karaokeId, sliceElement: slice, startChar, endChar };
                }).catch((err) => {
                  console.warn('Failed to unlock via karaoke click', err);
                  // Still try to play
                  audioUnlockedRef.current = true;
                  window.dispatchEvent(new CustomEvent('audioUnlocked'));
                  karaokeControllersRef.current.forEach((ctrl, id) => {
                    if (id !== karaokeId) {
                      ctrl.pause();
                    }
                  });
                  controller.resumeWordIndex = null;
                  controller.resumeTime = null;
                  controller.waitingForNextPage = false;
                  controller.playSlice(slice, startChar, endChar);
                  currentKaraokeSliceRef.current = { karaokeId, sliceElement: slice, startChar, endChar };
                });
              } else {
                // Already unlocked, just play
                console.log('Audio already unlocked, starting playback');
                karaokeControllersRef.current.forEach((ctrl, id) => {
                  if (id !== karaokeId) {
                    ctrl.pause();
                  }
                });
                controller.resumeWordIndex = null;
                controller.resumeTime = null;
                controller.waitingForNextPage = false;
                controller.playSlice(slice, startChar, endChar);
                currentKaraokeSliceRef.current = { karaokeId, sliceElement: slice, startChar, endChar };
              }
            } else {
              console.warn('Controller or audio not found', { controller: !!controller, audio: controller?.audio });
            }
          }
        };
        
        // Use click for both mobile and desktop; swipes are handled by global touch handlers
        slice.addEventListener('click', handleInteraction);
      }
    });
  }, [getKaraokeController, unlockAudioContext]);

  // Start playback for visible karaoke slice
  const startVisibleKaraoke = useCallback(() => {
    console.log('startVisibleKaraoke called', { 
      isTransitioning: isTransitioningRef.current, 
      audioUnlocked: audioUnlockedRef.current 
    });
    // Use ref instead of state to avoid stale closures
    if (isTransitioningRef.current) {
      console.log('Skipping - transitioning');
      return;
    }
    if (!audioUnlockedRef.current) {
      console.log('Skipping - audio not unlocked');
      return; // Don't try if audio isn't unlocked yet
    }
    
    const node = pageContentRef.current;
    if (!node || !node.isConnected) {
      console.log('Skipping - no node or not connected');
      return;
    }

    // FIRST: Check for resume state BEFORE initializing slices
    // We need to check if there's a controller with resume state for any karaoke on this page
    const tempSlices = node.querySelectorAll('.karaoke-slice');
    let hasResumeState = false;
    let resumeController = null;
    
    if (tempSlices.length > 0) {
      const firstSlice = tempSlices[0];
      const firstKaraokeId = firstSlice.getAttribute('data-karaoke-id');
      if (firstKaraokeId) {
        resumeController = getKaraokeController(firstKaraokeId);
        if (resumeController && typeof resumeController.resumeWordIndex === 'number' && resumeController.resumeTime !== null) {
          hasResumeState = true;
          console.log('[[RESUME]] Resume state found BEFORE initialization', {
            karaokeId: firstKaraokeId,
            resumeWordIndex: resumeController.resumeWordIndex,
            resumeTime: resumeController.resumeTime,
          });
        }
      }
    }

    // Now initialize slices (this is safe - it just wraps chars in spans, doesn't start playback)
    initializeKaraokeSlices(node);

    const slices = node.querySelectorAll('.karaoke-slice');
    console.log('Found karaoke slices', slices.length);
    if (slices.length === 0) return;

    console.log('[[PAGE ENTER]] startVisibleKaraoke invoked');

    // Determine which slice to start from
    let targetSlice = slices[0];
    let targetStartChar = parseInt(targetSlice.getAttribute('data-karaoke-start') || '0', 10);
    let targetEndChar = parseInt(targetSlice.getAttribute('data-karaoke-end') || '0', 10);
    let resumeWordIndex = null;

    // Get controller for the first slice's karaokeId so we can read resume state
    const firstKaraokeId = targetSlice.getAttribute('data-karaoke-id');
    if (!firstKaraokeId) {
      console.warn('[[PAGE ENTER]] No karaokeId on first slice');
      return;
    }
    const controller = resumeController || getKaraokeController(firstKaraokeId);
    console.log('[[PAGE ENTER]] Controller lookup', {
      karaokeId: firstKaraokeId,
      found: !!controller,
      waitingForNextPage: controller?.waitingForNextPage,
      resumeWordIndex: controller?.resumeWordIndex,
      resumeTime: controller?.resumeTime,
      hadResumeStateBeforeInit: hasResumeState,
    });
    if (!controller) return;

    // Check for resume state - even if waitingForNextPage was cleared, we might still have resume info
    if (typeof controller.resumeWordIndex === 'number' && controller.resumeTime !== null) {
      // Try to find the slice on this page that contains the resume word
      const resumeIndex = controller.resumeWordIndex;
      const sourceForResume = karaokeSourcesRef.current[firstKaraokeId];
      const resumeWordMeta = sourceForResume?.wordCharRanges?.[resumeIndex];
      const resumeCharPosition = resumeWordMeta ? resumeWordMeta.charStart : null;
      console.log('[[RESUME]] Resume state detected', {
        resumeWordIndex: resumeIndex,
        resumeCharPosition,
        resumeTime: controller.resumeTime,
        waitingForNextPage: controller.waitingForNextPage,
        note: 'Checking for resume even if waitingForNextPage is false',
      });

      if (typeof resumeCharPosition === 'number') {
        for (const slice of slices) {
          const sStart = parseInt(slice.getAttribute('data-karaoke-start') || '0', 10);
          const sEnd = parseInt(slice.getAttribute('data-karaoke-end') || '0', 10);
          console.log('[[RESUME]] Checking slice for resume', {
            sStart,
            sEnd,
            resumeCharPosition,
          });
          if (resumeCharPosition >= sStart && resumeCharPosition < sEnd) {
            targetSlice = slice;
            targetStartChar = sStart;
            targetEndChar = sEnd;
            resumeWordIndex = resumeIndex;
            break;
          }
        }
      }

      if (resumeWordIndex === null) {
        console.warn('[[RESUME]] No slice on this page contains resumeIndex, falling back to first slice', {
          requestedResumeIndex: resumeIndex,
          controllerResumeWordIndex: controller.resumeWordIndex,
        });
        // Don't clear waitingForNextPage if we didn't find the right slice
      } else {
        // We found the right slice - clear waiting flag after we start playback
        // (We'll clear it in playSlice after successful start)
      }
    }

    const karaokeId = targetSlice.getAttribute('data-karaoke-id');
    console.log('[[PAGE ENTER]] Karaoke slice info', {
      karaokeId,
      targetStartChar,
      targetEndChar,
      resumeWordIndex,
      resumeTime: controller.resumeTime,
    });
    if (!karaokeId) return;

    // Check if slice has been initialized (has karaoke-word spans)
    const hasWords = targetSlice.querySelectorAll('.karaoke-word').length > 0;
    console.log('[[PAGE ENTER]] Slice has words', hasWords);
    if (!hasWords) {
      // Slice not initialized yet, try again after a short delay
      console.log('Retrying - slice not initialized');
      setTimeout(() => {
        startVisibleKaraoke();
      }, 100);
      return;
    }

    // Check if slice is actually visible
    const rect = targetSlice.getBoundingClientRect();
    const isVisible = rect.top < window.innerHeight && rect.bottom > 0;
    console.log('[[PAGE ENTER]] Slice visibility', { isVisible, rect });
    if (!isVisible) return;

    // Pause any other karaoke that might be playing
    karaokeControllersRef.current.forEach((ctrl, id) => {
      if (id !== karaokeId) {
        ctrl.pause();
      }
    });

    // Re-read resume state from controller (in case we retried and lost the local variable)
    const finalResumeWordIndex = typeof controller.resumeWordIndex === 'number' ? controller.resumeWordIndex : resumeWordIndex;
    const finalResumeTime = controller.resumeTime !== null ? controller.resumeTime : null;
    
    // Start playback – if we have a resumeWordIndex, use it to start mid-slice
    console.log('[[PLAY]] Starting karaoke playback', { 
      resumeWordIndex: finalResumeWordIndex, 
      resumeTime: finalResumeTime,
      fromController: typeof controller.resumeWordIndex === 'number',
      localResumeWordIndex: resumeWordIndex,
    });
    const playOptions =
      typeof finalResumeWordIndex === 'number' && finalResumeTime !== null
        ? { resumeWordIndex: finalResumeWordIndex, resumeTime: finalResumeTime }
        : {};

    controller.playSlice(targetSlice, targetStartChar, targetEndChar, playOptions);
    currentKaraokeSliceRef.current = {
      karaokeId,
      sliceElement: targetSlice,
      startChar: targetStartChar,
      endChar: targetEndChar,
    };
  }, [isTransitioning, getKaraokeController, initializeKaraokeSlices]);

  // Navigate to next page
  const goToNextPage = useCallback(() => {
    if (isTransitioning || pages.length === 0) return;

    const currentPage = pages.find(
      (p) =>
        p.chapterIndex === currentChapterIndex &&
        p.pageIndex === currentPageIndex
    );

    if (!currentPage) {
      // Fallback to first page if current not found
      if (pages.length > 0) {
        setIsTransitioning(true);
        setCurrentChapterIndex(0);
        setCurrentPageIndex(0);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setIsTransitioning(false);
          });
        });
        if (onPageChange && pages[0]) {
          onPageChange({
            chapterId: pages[0].chapterId,
            pageIndex: 0,
          });
        }
      }
      return;
    }

    // Check if there's a next page in current chapter
    const nextPageInChapter = pages.find(
      (p) =>
        p.chapterIndex === currentChapterIndex &&
        p.pageIndex === currentPageIndex + 1
    );

    if (nextPageInChapter) {
      // Next page in same chapter
      setIsTransitioning(true);
      // Wait for fade-out to complete (1s), then update content and fade in
      setTimeout(() => {
        // Update both displayPage and indices together
        setDisplayPage(nextPageInChapter);
        setCurrentPageIndex(currentPageIndex + 1);
        // Wait for DOM to update and ink effect to be applied before starting fade-in
        // Use requestAnimationFrame to ensure DOM is ready, then give time for ink effect
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            // Now start fade-in - ink effect should be applied by now
            setIsTransitioning(false);
          });
        });
      }, 1000); // Wait for full fade-out duration

      if (onPageChange) {
        onPageChange({
          chapterId: currentPage.chapterId,
          pageIndex: currentPageIndex + 1,
          subchapterId: nextPageInChapter.subchapterId,
        });
      }
    } else {
      // Move to next chapter, first page
      if (!chapters || currentChapterIndex + 1 >= chapters.length) return;
      const nextChapter = chapters[currentChapterIndex + 1];
      if (nextChapter) {
        const firstPageOfNextChapter = pages.find(
          (p) => p.chapterIndex === currentChapterIndex + 1 && p.pageIndex === 0
        );
        if (firstPageOfNextChapter) {
          setIsTransitioning(true);
          // Wait for fade-out to complete (1s), then update content and fade in
          setTimeout(() => {
            // Update both displayPage and indices together
            setDisplayPage(firstPageOfNextChapter);
            setCurrentChapterIndex(currentChapterIndex + 1);
            setCurrentPageIndex(0);
            // Wait for DOM to update and ink effect to be applied before starting fade-in
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                setIsTransitioning(false);
              });
            });
          }, 1000); // Wait for full fade-out duration

          if (onPageChange) {
            onPageChange({
              chapterId: nextChapter.id,
              pageIndex: 0,
              subchapterId: firstPageOfNextChapter.subchapterId,
            });
          }
        }
      }
    }
  }, [
    currentChapterIndex,
    currentPageIndex,
    pages,
    chapters,
    isTransitioning,
    onPageChange,
  ]);

  // Check if touch target is interactive (karaoke, button, etc.)
  const isInteractiveTarget = useCallback((target) => {
    if (!target) return false;
    return (
      target.closest('.karaoke-slice') ||
      target.closest('.karaoke-char') ||
      target.closest('.karaoke-word') ||
      target.closest('button') ||
      target.closest('a') ||
      target.closest('input') ||
      target.closest('textarea')
    );
  }, []);

  // Handle touch start (for swipe detection)
  const handleTouchStart = useCallback((e) => {
    const touch = e.touches[0];
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
    };
    touchCurrentRef.current = {
      x: touch.clientX,
      y: touch.clientY,
    };
    swipeInProgressRef.current = false;
    tocDragStartYRef.current = null;
  }, []);

  // Handle touch move
  const handleTouchMove = useCallback((e) => {
    if (!touchStartRef.current) return;
    
    const deltaX = e.touches[0].clientX - touchStartRef.current.x;
    const deltaY = e.touches[0].clientY - touchStartRef.current.y;
    
    // Track vertical swipe down for TOC drag
    if (!isTOCOpen && Math.abs(deltaY) > Math.abs(deltaX) && deltaY > 0) {
      // Prevent page scrolling immediately when swiping down for TOC
      e.preventDefault();
      
      // Swiping down - track the drag progress
      if (tocDragStartYRef.current === null) {
        tocDragStartYRef.current = touchStartRef.current.y;
      }
      
      const dragDistance = e.touches[0].clientY - tocDragStartYRef.current;
      const viewportHeight = window.innerHeight;
      // Calculate progress: 0 when drag starts, 1 when dragged down by viewport height
      const progress = Math.min(Math.max(dragDistance / viewportHeight, 0), 1);
      
      // Store in ref to avoid React re-renders during drag
      tocDragProgressRef.current = progress;
      
      // Update TOC directly via DOM to avoid React re-render of page content
      // This prevents the page from re-rendering and losing ink effects
      const tocElement = document.querySelector('.mobile-toc-overlay');
      if (tocElement) {
        const container = tocElement.querySelector('.mobile-toc-container');
        if (container && progress > 0) {
          const translateY = Math.max(-100, -100 + (progress * 100));
          container.style.transform = `translateY(${translateY}%)`;
          container.style.transition = 'none';
          const textColor = 'white'; // Bright white during drag
          container.style.color = textColor;
          // Keep overlay fully opaque during drag so text is visible (curtain effect)
          tocElement.style.opacity = '1';
          tocElement.style.pointerEvents = 'auto';
        } else if (container && progress === 0) {
          // Reset when drag is cancelled
          container.style.transform = 'translateY(-100%)';
          container.style.transition = '';
          container.style.color = '';
          tocElement.style.opacity = '0';
          tocElement.style.pointerEvents = 'none';
        }
      }
    }
    
    // Only prevent default if it's clearly a horizontal swipe
    // This preserves gesture context for audio unlock
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
      e.preventDefault();
    }
    
    touchCurrentRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  }, [isTOCOpen]);

  // Navigate to previous page
  const goToPreviousPage = useCallback(() => {
    if (isTransitioning || pages.length === 0) return;

    const currentPage = pages.find(
      (p) =>
        p.chapterIndex === currentChapterIndex &&
        p.pageIndex === currentPageIndex
    );

    if (!currentPage) return;

    // Check if there's a previous page in current chapter
    if (currentPageIndex > 0) {
      // Previous page in same chapter
      const prevPage = pages.find(
        (p) =>
          p.chapterIndex === currentChapterIndex &&
          p.pageIndex === currentPageIndex - 1
      );
      
      if (prevPage) {
        setIsTransitioning(true);
        // Wait for fade-out to complete (1s), then update content and fade in
        setTimeout(() => {
          // Update both displayPage and indices together
          setDisplayPage(prevPage);
          setCurrentPageIndex(currentPageIndex - 1);
          // Wait for DOM to update and ink effect to be applied before starting fade-in
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              setIsTransitioning(false);
            });
          });
        }, 1000); // Wait for full fade-out duration

        if (onPageChange) {
          onPageChange({
            chapterId: currentPage.chapterId,
            pageIndex: currentPageIndex - 1,
            subchapterId: prevPage.subchapterId,
          });
        }
      }
    } else {
      // Move to previous chapter, last page
      if (currentChapterIndex > 0 && chapters && chapters.length > 0) {
        const prevChapter = chapters[currentChapterIndex - 1];
        if (prevChapter) {
          const lastPageOfPrevChapter = pages
            .filter((p) => p.chapterIndex === currentChapterIndex - 1)
            .sort((a, b) => b.pageIndex - a.pageIndex)[0];

          if (lastPageOfPrevChapter) {
            setIsTransitioning(true);
            // Wait for fade-out to complete (1s), then update content and fade in
            setTimeout(() => {
              // Update both displayPage and indices together
              setDisplayPage(lastPageOfPrevChapter);
              setCurrentChapterIndex(currentChapterIndex - 1);
              setCurrentPageIndex(lastPageOfPrevChapter.pageIndex);
              // Wait for DOM to update and ink effect to be applied before starting fade-in
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  setIsTransitioning(false);
                });
              });
            }, 1000); // Wait for full fade-out duration

            if (onPageChange) {
              onPageChange({
                chapterId: prevChapter.id,
                pageIndex: lastPageOfPrevChapter.pageIndex,
                subchapterId: lastPageOfPrevChapter.subchapterId,
              });
            }
          }
        }
      }
    }
  }, [
    currentChapterIndex,
    currentPageIndex,
    pages,
    chapters,
    isTransitioning,
    onPageChange,
  ]);

  // Handle touch end - determine swipe direction
  const handleTouchEnd = useCallback(
    (e) => {
      if (!touchStartRef.current || !touchCurrentRef.current) return;

      const deltaX = touchCurrentRef.current.x - touchStartRef.current.x;
      const deltaY = touchCurrentRef.current.y - touchStartRef.current.y;
      const deltaTime = Date.now() - touchStartRef.current.time;
      const minSwipeDistance = 50;
      const maxSwipeTime = 300;

      // Check if it's a vertical swipe down (for TOC)
      if (
        Math.abs(deltaY) > Math.abs(deltaX) &&
        deltaY > 0
      ) {
        if (!isTOCOpen) {
          // Calculate progress from actual drag distance
          const viewportHeight = window.innerHeight;
          const dragDistance = tocDragStartYRef.current !== null 
            ? touchCurrentRef.current.y - tocDragStartYRef.current
            : deltaY;
          const progress = Math.min(Math.max(dragDistance / viewportHeight, 0), 1);
          
          // Determine if we should open or close based on drag progress
          const finalProgress = tocDragProgressRef.current;
          const threshold = 0.25; // 25% threshold (20-30% range)
          
          if (finalProgress > threshold || deltaY > minSwipeDistance * 1.5) {
            // Dragged enough - smoothly animate TOC to fill page, then fade in background
            const tocElement = document.querySelector('.mobile-toc-overlay');
            const container = tocElement?.querySelector('.mobile-toc-container');
            
            if (container) {
              // Phase 1: Smoothly animate container to fill the page (curtain effect)
              container.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
              container.style.transform = 'translateY(0%)';
              
              // Phase 2: After container animation completes, set state to trigger background fade-in
              setTimeout(() => {
                setIsTOCOpen(true);
                setTocDragProgress(1);
                tocDragProgressRef.current = 1;
              }, 400); // Wait for container animation to complete (400ms)
            } else {
              // Fallback if DOM not ready
              setIsTOCOpen(true);
              setTocDragProgress(1);
              tocDragProgressRef.current = 1;
            }
            
            // Stop all karaoke playback
            karaokeControllersRef.current.forEach((controller) => {
              controller.stop();
            });
          } else {
            // Didn't drag enough - smoothly snap back closed
            const tocElement = document.querySelector('.mobile-toc-overlay');
            if (tocElement) {
              const container = tocElement.querySelector('.mobile-toc-container');
              if (container) {
                // Smoothly animate back up
                container.style.transition = 'transform 0.3s cubic-bezier(0.55, 0.055, 0.675, 0.19)';
                container.style.transform = 'translateY(-100%)';
                
                // Fade out overlay after animation
                setTimeout(() => {
                  tocElement.style.opacity = '0';
                  tocElement.style.pointerEvents = 'none';
                  container.style.color = '';
                  setTocDragProgress(0);
                  tocDragProgressRef.current = 0;
                }, 300);
              }
            }
          }
        }
        tocDragStartYRef.current = null;
        touchStartRef.current = null;
        touchCurrentRef.current = null;
        return;
      }
      
      // Reset TOC drag if it was a different gesture
      if (tocDragProgressRef.current > 0 && !isTOCOpen) {
        setTocDragProgress(0);
        tocDragProgressRef.current = 0;
        // Reset TOC element via DOM
        requestAnimationFrame(() => {
          const tocElement = document.querySelector('.mobile-toc-overlay');
          if (tocElement) {
            tocElement.style.opacity = '0';
            tocElement.style.pointerEvents = 'none';
            const container = tocElement.querySelector('.mobile-toc-container');
            if (container) {
              container.style.transform = 'translateY(-100%)';
              container.style.transition = '';
              container.style.color = '';
            }
          }
        });
        tocDragStartYRef.current = null;
      }

      // Check if it's a horizontal swipe
      if (
        Math.abs(deltaX) > Math.abs(deltaY) &&
        Math.abs(deltaX) > minSwipeDistance &&
        deltaTime < maxSwipeTime
      ) {
        // Unlock audio if not already unlocked - use AudioContext for reliable unlock
        if (!audioUnlockedRef.current) {
          console.log('Swipe detected - unlocking audio via AudioContext...');
          try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
              // Create a temporary context to unlock
              const ctx = new AudioContext();
              if (ctx.state === 'suspended') {
                ctx.resume().then(() => {
                  console.log('AudioContext resumed - audio unlocked');
                  audioUnlockedRef.current = true;
                  window.dispatchEvent(new CustomEvent('audioUnlocked'));
                  // Close the temporary context
                  ctx.close();
                }).catch((err) => {
                  console.warn('AudioContext resume failed', err);
                  // Still mark as unlocked
                  audioUnlockedRef.current = true;
                  window.dispatchEvent(new CustomEvent('audioUnlocked'));
                });
              } else {
                // Already running
                audioUnlockedRef.current = true;
                window.dispatchEvent(new CustomEvent('audioUnlocked'));
                ctx.close();
              }
            } else {
              // Fallback: just mark as unlocked
              console.log('AudioContext not available, marking as unlocked');
              audioUnlockedRef.current = true;
              window.dispatchEvent(new CustomEvent('audioUnlocked'));
            }
          } catch (err) {
            console.error('Error unlocking audio', err);
            audioUnlockedRef.current = true;
            window.dispatchEvent(new CustomEvent('audioUnlocked'));
          }
        }
        
        if (deltaX > 0) {
          // Swipe right - previous page
          goToPreviousPage();
        } else {
          // Swipe left - next page
          goToNextPage();
        }
      }

      touchStartRef.current = null;
      touchCurrentRef.current = null;
    },
    [goToNextPage, goToPreviousPage, isTOCOpen]
  );

  // Get current page data
  const currentPage = pages.find(
    (p) =>
      p.chapterIndex === currentChapterIndex && p.pageIndex === currentPageIndex
  );

  // Jump to a specific page (for TOC navigation)
  const jumpToPage = useCallback((targetChapterIndex, targetPageIndex) => {
    if (isTransitioning || pages.length === 0) return;
    
    const targetPage = pages.find(
      (p) => p.chapterIndex === targetChapterIndex && p.pageIndex === targetPageIndex
    );
    
    if (!targetPage) return;
    
    setIsTransitioning(true);
    setTimeout(() => {
      setDisplayPage(targetPage);
      setCurrentChapterIndex(targetChapterIndex);
      setCurrentPageIndex(targetPageIndex);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsTransitioning(false);
        });
      });
    }, 1000);
    
    if (onPageChange) {
      onPageChange({
        chapterId: targetPage.chapterId,
        pageIndex: targetPageIndex,
        subchapterId: targetPage.subchapterId,
      });
    }
  }, [isTransitioning, pages, onPageChange]);

  // Initialize displayPage only on first load - never update it during normal operation
  // This prevents interference with transitions
  useEffect(() => {
    if (pages.length > 0 && !displayPage && currentPage) {
      setDisplayPage(currentPage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages.length]); // Only depend on pages.length to run once when pages are first loaded

  // Ensure valid page state - MUST be before any conditional returns
  useEffect(() => {
    if (pages.length > 0 && !currentPage) {
      // Current page not found, reset to first page
      const firstPage = pages[0];
      if (firstPage) {
        setCurrentChapterIndex(firstPage.chapterIndex);
        setCurrentPageIndex(firstPage.pageIndex);
      }
    }
  }, [pages, currentPage]);

  // Use displayPage for rendering, fallback to currentPage
  const pageToDisplay = displayPage || currentPage;
  
  // Clear preserved HTML when page changes
  useEffect(() => {
    if (pageToDisplay) {
      const currentPageKey = `page-${pageToDisplay.chapterIndex}-${pageToDisplay.pageIndex}`;
      // If we're on a different page, clear the preserved HTML
      if (preservedPageKeyRef.current !== currentPageKey) {
        preservedInkHTMLRef.current = null;
        preservedPageKeyRef.current = null;
      }
    }
  }, [pageToDisplay?.chapterIndex, pageToDisplay?.pageIndex]);

  // Callback ref to apply ink effect directly when content node is set
  // Must be defined before any conditional returns (Rules of Hooks)
  const pageContentRef = useRef(null);
  const isTransitioningRef = useRef(false);
  const preservedInkHTMLRef = useRef(null); // Store HTML with ink effect before transition
  const preservedPageKeyRef = useRef(null); // Track which page the preserved HTML belongs to
  
  // Pause all karaoke when transitioning
  useEffect(() => {
    if (isTransitioning) {
      karaokeControllersRef.current.forEach((controller) => {
        controller.pause();
      });
      currentKaraokeSliceRef.current = null;
    }
  }, [isTransitioning]);

  // Listen for audio unlock and start playback
  useEffect(() => {
    const handleAudioUnlocked = () => {
      console.log('audioUnlocked event received', { isTransitioning });
      // If we're transitioning, the transition-end effect will handle starting karaoke
      // Otherwise, start immediately
      if (!isTransitioning) {
        console.log('Starting karaoke immediately (not transitioning)');
        setTimeout(() => {
          startVisibleKaraoke();
        }, 100);
      } else {
        console.log('Will start karaoke after transition ends');
      }
    };

    window.addEventListener('audioUnlocked', handleAudioUnlocked);
    return () => {
      window.removeEventListener('audioUnlocked', handleAudioUnlocked);
    };
  }, [startVisibleKaraoke, isTransitioning]);

  // Start karaoke when transition ends
  useEffect(() => {
    if (!isTransitioning) {
      // Update ref to match state
      isTransitioningRef.current = false;
      
      // Wait for DOM to settle and slices to be initialized
      const timer = setTimeout(() => {
        const node = pageContentRef.current;
        if (node && node.isConnected) {
          // Ensure slices are initialized before trying to start
          initializeKaraokeSlices(node);
        }
        
        // Check if audio is unlocked, if not wait for it
        if (audioUnlockedRef.current) {
          console.log('Transition ended, audio unlocked, starting karaoke');
          // Give a bit more time for initialization
          setTimeout(() => {
            startVisibleKaraoke();
          }, 200);
        } else {
          console.log('Transition ended, audio not unlocked yet, waiting...');
          // Wait for audio unlock event
          const handleUnlock = () => {
            console.log('Audio unlocked after transition, starting karaoke');
            setTimeout(() => {
              const node = pageContentRef.current;
              if (node && node.isConnected) {
                initializeKaraokeSlices(node);
              }
              setTimeout(() => {
                startVisibleKaraoke();
              }, 200);
            }, 100);
            window.removeEventListener('audioUnlocked', handleUnlock);
          };
          window.addEventListener('audioUnlocked', handleUnlock);
          // Also check periodically in case event was missed
          const checkInterval = setInterval(() => {
            if (audioUnlockedRef.current) {
              clearInterval(checkInterval);
              window.removeEventListener('audioUnlocked', handleUnlock);
              const node = pageContentRef.current;
              if (node && node.isConnected) {
                initializeKaraokeSlices(node);
              }
              setTimeout(() => {
                startVisibleKaraoke();
              }, 200);
            }
          }, 100);
          // Cleanup after 5 seconds
          setTimeout(() => {
            clearInterval(checkInterval);
            window.removeEventListener('audioUnlocked', handleUnlock);
          }, 5000);
        }
      }, 1200); // After fade-in completes (1000ms fade + 200ms buffer)
      return () => clearTimeout(timer);
    }
  }, [isTransitioning, startVisibleKaraoke, initializeKaraokeSlices]);

  // Keep ref in sync with state and watch for HTML resets during transitions
  useEffect(() => {
    isTransitioningRef.current = isTransitioning;
    
    const node = pageContentRef.current;
    if (!node || !node.isConnected) return;
    
    // When transitioning starts, immediately check and restore ink effect
    if (isTransitioning) {
      const currentPageKey = pageToDisplay 
        ? `page-${pageToDisplay.chapterIndex}-${pageToDisplay.pageIndex}`
        : null;
      
      // Synchronous check first - catch any immediate resets
      const hasInkChars = node.querySelectorAll('.ink-char-mobile').length > 0;
      // Only restore if preserved HTML is for the current page
      if (!hasInkChars && preservedInkHTMLRef.current && preservedPageKeyRef.current === currentPageKey) {
        // Always restore from preserved HTML during transitions - never apply fresh
        node.innerHTML = preservedInkHTMLRef.current;
      }
      
      // Use requestAnimationFrame to catch any resets that happen in the next frame
      requestAnimationFrame(() => {
        if (node && node.isConnected && isTransitioningRef.current) {
          const hasInkChars = node.querySelectorAll('.ink-char-mobile').length > 0;
          const currentPageKey = pageToDisplay 
            ? `page-${pageToDisplay.chapterIndex}-${pageToDisplay.pageIndex}`
            : null;
          // Only restore if preserved HTML is for the current page
          if (!hasInkChars && preservedInkHTMLRef.current && preservedPageKeyRef.current === currentPageKey) {
            // Always restore from preserved HTML during transitions - never apply fresh
            node.innerHTML = preservedInkHTMLRef.current;
          }
        }
      });
      
      // Also set up a MutationObserver to catch any HTML resets during transition
      const observer = new MutationObserver(() => {
        if (node && node.isConnected && isTransitioningRef.current) {
          const hasInkChars = node.querySelectorAll('.ink-char-mobile').length > 0;
          const currentPageKey = pageToDisplay 
            ? `page-${pageToDisplay.chapterIndex}-${pageToDisplay.pageIndex}`
            : null;
          // Only restore if preserved HTML is for the current page
          if (!hasInkChars && preservedInkHTMLRef.current && preservedPageKeyRef.current === currentPageKey) {
            // React reset the HTML - always restore from preserved HTML during transitions
            // This ensures the same characters have ink throughout the fade-out
            node.innerHTML = preservedInkHTMLRef.current;
          }
        }
      });
      
      observer.observe(node, {
        childList: true,
        subtree: true,
        characterData: true
      });
      
      return () => {
        observer.disconnect();
      };
    }
  }, [isTransitioning, pageToDisplay]);
  
  // Watch for TOC closing and continuously restore ink effects if React resets them
  const prevIsTOCOpenRef = useRef(isTOCOpen);
  const isTOCClosingRef = useRef(false);
  const restoreTimeoutRef = useRef(null);
  
  useEffect(() => {
    const justClosed = prevIsTOCOpenRef.current && !isTOCOpen;
    prevIsTOCOpenRef.current = isTOCOpen;
    
    if (justClosed) {
      // TOC is closing - set flag and keep watching for React's HTML reset
      isTOCClosingRef.current = true;
      
      // Keep watching for longer to catch delayed re-renders
      if (restoreTimeoutRef.current) {
        clearTimeout(restoreTimeoutRef.current);
      }
      restoreTimeoutRef.current = setTimeout(() => {
        isTOCClosingRef.current = false;
      }, 4000); // Watch for 4 seconds to catch any delayed re-renders
    }
  }, [isTOCOpen]);
  
  // Use MutationObserver to catch when React resets the HTML and restore immediately
  useEffect(() => {
    if (isTransitioning) return;
    
    const pageContent = pageContentRef.current;
    if (!pageContent) return;
    
    const currentPageKey = pageToDisplay 
      ? `page-${pageToDisplay.chapterIndex}-${pageToDisplay.pageIndex}`
      : null;
    
    if (!currentPageKey || !preservedInkHTMLRef.current || preservedPageKeyRef.current !== currentPageKey) {
      return;
    }
    
    // Watch for innerHTML changes (React resetting the content)
    const observer = new MutationObserver(() => {
      // Always restore if ink effects are missing, not just during closing
      // This ensures restoration happens even after animation completes
      const hasInkChars = pageContent.querySelectorAll('.ink-char-mobile').length > 0;
      if (!hasInkChars) {
        // React just reset the HTML - restore immediately
        pageContent.innerHTML = preservedInkHTMLRef.current;
      }
    });
    
    observer.observe(pageContent, {
      childList: true,
      subtree: true,
      characterData: true
    });
    
    // Also check immediately when TOC opens or closes
    const checkAndRestore = () => {
      const hasInkChars = pageContent.querySelectorAll('.ink-char-mobile').length > 0;
      if (!hasInkChars) {
        requestAnimationFrame(() => {
          if (pageContentRef.current) {
            pageContentRef.current.innerHTML = preservedInkHTMLRef.current;
          }
        });
      }
    };
    
    // Check immediately
    checkAndRestore();
    
    // Also check periodically for a bit after TOC state changes
    const intervalId = setInterval(() => {
      checkAndRestore();
    }, 100);
    
    const timeoutId = setTimeout(() => {
      clearInterval(intervalId);
    }, 3000); // Check for 3 seconds after state change
    
    return () => {
      observer.disconnect();
      clearInterval(intervalId);
      clearTimeout(timeoutId);
    };
  }, [isTOCOpen, pageToDisplay, isTransitioning]);
  
  const pageContentRefCallback = useCallback((node) => {
    pageContentRef.current = node;
    if (node && node.isConnected) {
      // Get current page key to track which page this HTML belongs to
      const currentPageKey = pageToDisplay 
        ? `page-${pageToDisplay.chapterIndex}-${pageToDisplay.pageIndex}`
        : null;
      
      // Apply ink effect with multiple attempts to ensure it applies
      const applyInk = () => {
        if (node && node.isConnected) {
          // Check if already processed to avoid double-processing
          const hasInkChars = node.querySelectorAll('.ink-char-mobile').length > 0;
          if (!hasInkChars) {
            // If we have preserved HTML for THIS page, restore it
            // Otherwise, apply fresh ink effect
            if (preservedInkHTMLRef.current && preservedPageKeyRef.current === currentPageKey && !isTransitioningRef.current) {
              node.innerHTML = preservedInkHTMLRef.current;
            } else if (!preservedInkHTMLRef.current || preservedPageKeyRef.current !== currentPageKey) {
              applyInkEffectToTextMobile(node, { probability: 0.25 });
              // Immediately preserve the HTML after applying ink effect
              // This ensures we always have the canonical version stored
              preservedInkHTMLRef.current = node.innerHTML;
              preservedPageKeyRef.current = currentPageKey;
            }
          } else if (!preservedInkHTMLRef.current || preservedPageKeyRef.current !== currentPageKey) {
            // Ink chars exist but we haven't preserved HTML yet for this page - preserve it now
            preservedInkHTMLRef.current = node.innerHTML;
            preservedPageKeyRef.current = currentPageKey;
          }
        }
      };
      
      // Always check immediately - if ink chars are missing, reapply
      // This is especially important during transitions when React might reset the HTML
      const hasInkChars = node.querySelectorAll('.ink-char-mobile').length > 0;
      if (!hasInkChars) {
        // During transitions, restore from preserved HTML only if it's for the current page
        if (isTransitioningRef.current && preservedInkHTMLRef.current && preservedPageKeyRef.current === currentPageKey) {
          node.innerHTML = preservedInkHTMLRef.current;
        } else {
          applyInk();
        }
      } else if (!preservedInkHTMLRef.current || preservedPageKeyRef.current !== currentPageKey) {
        // Ink chars exist but we haven't preserved HTML yet for this page - preserve it now
        preservedInkHTMLRef.current = node.innerHTML;
        preservedPageKeyRef.current = currentPageKey;
      }
      
      // Always try after DOM is fully ready, regardless of transition state
      // This ensures ink effect is applied even if content loads asynchronously
      requestAnimationFrame(() => {
        if (node && node.isConnected) {
          const hasInkChars = node.querySelectorAll('.ink-char-mobile').length > 0;
          if (!hasInkChars) {
            // During transitions, restore from preserved HTML only if it's for the current page
            if (isTransitioningRef.current && preservedInkHTMLRef.current && preservedPageKeyRef.current === currentPageKey) {
              node.innerHTML = preservedInkHTMLRef.current;
            } else {
              applyInk();
            }
          } else if (!preservedInkHTMLRef.current || preservedPageKeyRef.current !== currentPageKey) {
            // Ink chars exist but we haven't preserved HTML yet for this page - preserve it now
            preservedInkHTMLRef.current = node.innerHTML;
            preservedPageKeyRef.current = currentPageKey;
          }
          
          // Initialize karaoke slices after ink effect is applied
          initializeKaraokeSlices(node);
          
          // One more try after next frame as backup
          requestAnimationFrame(() => {
            if (node && node.isConnected) {
              const hasInkChars = node.querySelectorAll('.ink-char-mobile').length > 0;
              if (!hasInkChars) {
                // During transitions, restore from preserved HTML only if it's for the current page
                if (isTransitioningRef.current && preservedInkHTMLRef.current && preservedPageKeyRef.current === currentPageKey) {
                  node.innerHTML = preservedInkHTMLRef.current;
                } else {
                  applyInk();
                }
              } else if (!preservedInkHTMLRef.current || preservedPageKeyRef.current !== currentPageKey) {
                // Ink chars exist but we haven't preserved HTML yet for this page - preserve it now
                preservedInkHTMLRef.current = node.innerHTML;
                preservedPageKeyRef.current = currentPageKey;
              }
              
              // Initialize karaoke slices again after second frame
              initializeKaraokeSlices(node);
              
              // DON'T call startVisibleKaraoke here - let the transition end effect handle it
              // This ensures resume state is always checked before starting playback
            }
          });
        }
      });
      
      // During transitions, also check after a short delay to catch any race conditions
      // where React might reset the HTML after the initial application
      if (isTransitioningRef.current) {
        setTimeout(() => {
          if (node && node.isConnected) {
            const hasInkChars = node.querySelectorAll('.ink-char-mobile').length > 0;
            // Only restore if preserved HTML is for the current page
            if (!hasInkChars && preservedInkHTMLRef.current && preservedPageKeyRef.current === currentPageKey) {
              // Always restore from preserved HTML during transitions
              node.innerHTML = preservedInkHTMLRef.current;
            }
          }
        }, 50);
      }
    }
  }, [pageToDisplay, initializeKaraokeSlices, startVisibleKaraoke]); // Include dependencies

  // Cleanup karaoke controllers on unmount
  useEffect(() => {
    return () => {
      karaokeControllersRef.current.forEach((controller) => {
        controller.cleanup();
      });
      karaokeControllersRef.current.clear();
    };
  }, []);

  if (typeof window !== 'undefined' && window.innerWidth > 768) {
    // Desktop: render children normally (no pagination)
    return null;
  }

  if (pages.length === 0 || isInitializing) {
    return <div className="page-reader-loading">Loading pages...</div>;
  }

  if (!pageToDisplay) {
    return <div className="page-reader-loading">Loading...</div>;
  }

  // Calculate current page number (1-indexed)
  const pageKey = `page-${pageToDisplay.chapterIndex}-${pageToDisplay.pageIndex}`;
  const currentPageNumber =
    pages.findIndex(
      (p) => p.chapterIndex === pageToDisplay.chapterIndex && p.pageIndex === pageToDisplay.pageIndex
    ) + 1;
  const totalPages = pages.length;
  const shouldShowTopBar = !pageToDisplay.hasHeading;

  return (
    <div
      ref={containerRef}
      className="page-reader"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div
        ref={pageContainerRef}
        className={`page-container ${isTransitioning ? 'transitioning' : ''}`}
      >
        <article className="page-sheet content-page">
          <section className="page-body content-body">
            <div 
              key={pageKey}
              ref={pageContentRefCallback} 
              className="page-content" 
              dangerouslySetInnerHTML={{ __html: pageToDisplay.content }} 
            />
          </section>
        </article>
      </div>
      <div className="page-number">
        {currentPageNumber}
      </div>
      {shouldShowTopBar && (
        <ReaderTopBar
          chapterTitle={pageToDisplay.chapterTitle}
          subchapterTitle={pageToDisplay.subchapterTitle}
          pageKey={pageKey}
        />
      )}
      <MobileTOC
        chapters={chapters}
        pages={pages}
        currentChapterIndex={currentChapterIndex}
        currentPageIndex={currentPageIndex}
        currentSubchapterId={currentPage?.subchapterId || null}
        isOpen={isTOCOpen}
        dragProgress={tocDragProgress}
        onClose={() => {
          // Preserve current HTML with ink effects BEFORE closing
          const pageContent = pageContentRef.current;
          if (pageContent) {
            const currentPageKey = pageToDisplay 
              ? `page-${pageToDisplay.chapterIndex}-${pageToDisplay.pageIndex}`
              : null;
            const hasInkChars = pageContent.querySelectorAll('.ink-char-mobile').length > 0;
            if (hasInkChars && currentPageKey) {
              // Preserve the HTML with ink effects before React resets it
              preservedInkHTMLRef.current = pageContent.innerHTML;
              preservedPageKeyRef.current = currentPageKey;
            }
          }
          
          setIsTOCOpen(false);
          setTocDragProgress(0);
          tocDragProgressRef.current = 0;
          
          // Restore ink effects immediately after React re-renders, during the blur
          // Use multiple requestAnimationFrame to ensure it happens during blur phase
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                const pageContentAfter = pageContentRef.current;
                if (pageContentAfter) {
                  const currentPageKey = pageToDisplay 
                    ? `page-${pageToDisplay.chapterIndex}-${pageToDisplay.pageIndex}`
                    : null;
                  if (currentPageKey && preservedInkHTMLRef.current && preservedPageKeyRef.current === currentPageKey) {
                    pageContentAfter.innerHTML = preservedInkHTMLRef.current;
                  }
                }
              });
            });
          });
        }}
        onJumpToPage={jumpToPage}
        onEditChapter={onEditChapter}
        onAddSubchapter={onAddSubchapter}
        onDeleteChapter={onDeleteChapter}
        onEditSubchapter={onEditSubchapter}
        onDeleteSubchapter={onDeleteSubchapter}
        onReorderChapters={onReorderChapters}
        onOpenSettings={onOpenSettings}
        onAddChapter={onAddChapter}
        onToggleEditorReader={onToggleEditorReader}
      />
    </div>
  );
};

