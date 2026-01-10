import { useEffect, useLayoutEffect, useRef, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { PDFViewer } from './PDFViewer';
import { ReaderTopBar } from './ReaderTopBar';
import { DesktopTOC } from './DesktopTOC';
import { useKaraokePlayer } from '../hooks/useKaraokePlayer';
import paperTexture from '../assets/paper-7-origami-TEX.png';

/**
 * DesktopPageReader - Desktop-specific page reader component
 * Renders all pages in a scrollable two-page spread PDF-style viewer
 */
export const DesktopPageReader = ({ 
  pages, 
  karaokeSources = {},
  chapters = [],
  currentChapterIndex,
  currentPageIndex,
  currentSubchapterId,
  onJumpToPage,
  onEditChapter,
  onAddSubchapter,
  onDeleteChapter,
  onEditSubchapter,
  onDeleteSubchapter,
  onReorderChapters,
}) => {
  // IMPORTANT: All hooks must be called before any conditional returns
  // This ensures the hook order remains consistent across renders
  const { initializeKaraokeSlices, observePage, unobservePage } = useKaraokePlayer({
    isDesktop: true,
    karaokeSources
  });
  
  const initializedPagesRef = useRef(new Set());
  const [mostVisiblePage, setMostVisiblePage] = useState(null);
  
  // Create pagesWithTOC array early (before hooks that depend on it)
  const pagesWithTOC = useMemo(() => {
    const firstPageIndex = pages.findIndex(p => p.isFirstPage);
    const coverPageIndex = pages.findIndex(p => p.isCover && !p.isFirstPage);
    
    const result = [];
    pages.forEach((page, index) => {
      result.push(page);
      
      // Insert TOC after cover page (if exists) or after first page (if no cover)
      if (coverPageIndex >= 0 && index === coverPageIndex) {
        result.push({
          isTOC: true,
          chapterIndex: -3,
          pageIndex: -1,
        });
      } else if (coverPageIndex < 0 && firstPageIndex >= 0 && index === firstPageIndex) {
        result.push({
          isTOC: true,
          chapterIndex: -3,
          pageIndex: -1,
        });
      }
    });
    
    // If no first or cover pages exist, insert TOC at the beginning
    if (firstPageIndex < 0 && coverPageIndex < 0) {
      result.unshift({
        isTOC: true,
        chapterIndex: -3,
        pageIndex: -1,
      });
    }
    
    return result;
  }, [pages]);
  
  // Track most centered/visible page for progress bar
  useEffect(() => {
    if (pagesWithTOC.length === 0) return;
    
    // Find most centered page based on scroll position
    const handleScroll = () => {
      if (pagesWithTOC.length === 0) return;
      
      // Calculate which page is most centered in viewport
      const viewportCenter = window.innerHeight / 2;
      let minDistance = Infinity;
      let mostCenteredPage = null;
      
      pagesWithTOC.forEach((page, index) => {
        const pageElement = document.getElementById(`pdf-page-${index}`);
        if (!pageElement) return;
        
        const pageSheet = pageElement.querySelector('.page-sheet');
        if (!pageSheet) return;
        
        const rect = pageSheet.getBoundingClientRect();
        
        // Check if page is visible in viewport (at least partially)
        if (rect.bottom >= 0 && rect.top <= window.innerHeight) {
          const pageCenter = rect.top + rect.height / 2;
          const distanceFromCenter = Math.abs(pageCenter - viewportCenter);
          
          // Calculate how much of the page is visible
          const visibleTop = Math.max(0, rect.top);
          const visibleBottom = Math.min(window.innerHeight, rect.bottom);
          const visibleHeight = Math.max(0, visibleBottom - visibleTop);
          const visibilityRatio = visibleHeight / Math.min(rect.height, window.innerHeight);
          
          // Only consider pages that are at least 30% visible and prefer those closer to center
          if (visibilityRatio >= 0.3 && distanceFromCenter < minDistance) {
            minDistance = distanceFromCenter;
            mostCenteredPage = page;
          }
        }
      });
      
      // Only update if it's a regular page (not first, cover, or TOC)
      if (mostCenteredPage && !mostCenteredPage.isFirstPage && !mostCenteredPage.isCover && !mostCenteredPage.isTOC) {
        setMostVisiblePage(mostCenteredPage);
      } else {
        setMostVisiblePage(null);
      }
    };
    
    const scrollContainer = document.querySelector('.pdf-viewer');
    if (scrollContainer) {
      // Call immediately to set initial state
      handleScroll();
      
      // Then listen for scroll events
      scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
      
      // Also check periodically in case IntersectionObserver misses updates
      const intervalId = setInterval(handleScroll, 200);
      
      return () => {
        if (scrollContainer) {
          scrollContainer.removeEventListener('scroll', handleScroll);
        }
        clearInterval(intervalId);
      };
    }
  }, [pagesWithTOC]);
  
  // Calculate chapter progress based on most visible page
  const chapterProgress = useMemo(() => {
    if (!mostVisiblePage || mostVisiblePage.isFirstPage || mostVisiblePage.isCover || mostVisiblePage.isTOC) {
      return 0;
    }
    
    const currentChapterPages = pagesWithTOC.filter(p => 
      p.chapterIndex === mostVisiblePage.chapterIndex && 
      !p.isFirstPage && 
      !p.isCover &&
      !p.isTOC
    );
    
    const currentPageInChapter = currentChapterPages.findIndex(p => 
      p.pageIndex === mostVisiblePage.pageIndex && 
      p.chapterIndex === mostVisiblePage.chapterIndex
    );
    
    const totalPagesInChapter = currentChapterPages.length;
    return totalPagesInChapter > 0 
      ? (currentPageInChapter + 1) / totalPagesInChapter 
      : 0;
  }, [mostVisiblePage, pagesWithTOC]);
  
  // Initialize karaoke for all pages after render
  // This hook must be called even when pages.length === 0 to maintain hook order
  // Use useEffect with minimal delay to ensure dangerouslySetInnerHTML content is ready
  useEffect(() => {
    // Early return inside the effect is fine - it doesn't change hook order
    if (pages.length === 0) return;
    
    // Use requestAnimationFrame to ensure DOM is ready, but initialize all pages immediately
    // This ensures dangerouslySetInnerHTML content is inserted before we query for slices
    const rafId = requestAnimationFrame(() => {
      // Initialize all pages immediately - don't wait for scroll/visibility
      console.log('[DesktopPageReader] Initializing karaoke for', pages.length, 'pages');
      
      const initPromises = [];
      
      pages.forEach((page, index) => {
        const pageElement = document.getElementById(`pdf-page-${index}`);
        if (!pageElement) {
          console.warn('[DesktopPageReader] Page element not found for index', index);
          return;
        }
        
        // The page-sheet is the direct child of pdf-page-wrapper
        const pageSheet = pageElement.querySelector('.page-sheet');
        if (!pageSheet) {
          console.warn('[DesktopPageReader] Page sheet not found for index', index);
          return;
        }
        
        const pageContent = pageSheet.querySelector('.page-content');
        if (!pageContent) {
          console.warn('[DesktopPageReader] Page content not found for index', index);
          return;
        }
        
        const pageKey = `pdf-page-${index}-${page.chapterIndex}-${page.pageIndex}`;
        
        // Only initialize once per page
        if (initializedPagesRef.current.has(pageKey)) {
          console.log('[DesktopPageReader] Page already initialized:', pageKey);
          return;
        }
        
        // Set data-page-key on page-sheet for IntersectionObserver
        pageSheet.setAttribute('data-page-key', pageKey);
        
        // Check for karaoke slices
        const slices = pageContent.querySelectorAll('.karaoke-slice');
        console.log('[DesktopPageReader] Found', slices.length, 'karaoke slices on page', index);
        
        if (slices.length === 0) {
          // No slices on this page, but still mark as initialized and observe
          initializedPagesRef.current.add(pageKey);
          observePage(pageSheet);
          return;
        }
        
        // Initialize karaoke slices immediately (don't wait for scroll)
        const initPromise = initializeKaraokeSlices(pageContent).then(() => {
          console.log('[DesktopPageReader] Initialized karaoke for page', index);
          initializedPagesRef.current.add(pageKey);
          
          // Observe page for visibility (desktop) - for pause/resume on scroll
          observePage(pageSheet);
        }).catch((err) => {
          console.error('[DesktopPageReader] Error initializing karaoke for page', index, err);
        });
        
        initPromises.push(initPromise);
      });
      
      // Wait for all initializations to complete
      Promise.all(initPromises).then(() => {
        console.log('[DesktopPageReader] All karaoke pages initialized');
      });
    });
    
    return () => {
      cancelAnimationFrame(rafId);
      // Unobserve all pages on cleanup
      pages.forEach((page, index) => {
        const pageElement = document.getElementById(`pdf-page-${index}`);
        if (pageElement) {
          const pageSheet = pageElement.querySelector('.page-sheet');
          if (pageSheet) {
            unobservePage(pageSheet);
          }
        }
      });
    };
  }, [pages, initializeKaraokeSlices, observePage, unobservePage]);

  console.log('[DesktopPageReader] Rendering with', pages.length, 'pages');
  
  // Early return AFTER all hooks
  if (pages.length === 0) {
    console.log('[DesktopPageReader] No pages, showing loading');
    return (
      <div className="page-reader-loading" />
    );
  }


  // Helper function to render a single page
  const renderPage = (page, index, allPages) => {
    if (!page) return null;
    
    const pageKey = `pdf-page-${index}-${page.chapterIndex}-${page.pageIndex}`;
    
    // Calculate page number excluding first page, cover, and TOC (for display)
    const regularPages = allPages.filter(p => !p.isFirstPage && !p.isCover && !p.isTOC);
    const displayPageNumber = (page.isFirstPage || page.isCover || page.isTOC) ? 0 : regularPages.findIndex(
      (p) => p.chapterIndex === page.chapterIndex && p.pageIndex === page.pageIndex
    ) + 1;
    
    const shouldShowTopBar = page && !page.hasHeading && !page.isEpigraph && !page.isCover && !page.isFirstPage && !page.isTOC && !page.hasFieldNotes && page.pageIndex > 0;

    // Apply background image style if available
    // For TOC page, use paper texture; otherwise use page's backgroundImageUrl
    const pageStyle = page?.isTOC ? {
      backgroundImage: `url(${paperTexture})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center center',
      backgroundRepeat: 'no-repeat'
    } : page?.backgroundImageUrl ? {
      backgroundImage: `url(${page.backgroundImageUrl})`,
      backgroundSize: 'cover',
      backgroundPosition: 'left center',
      backgroundRepeat: 'no-repeat'
    } : {};

    // Add class when background image is present for CSS targeting
    const hasBackgroundImage = !!page?.backgroundImageUrl || page?.isTOC;

    return (
      <article 
        className={`page-sheet content-page ${page?.isEpigraph ? 'epigraph-page' : ''} ${page?.isVideo ? 'video-page' : ''} ${page?.isCover ? 'cover-page' : ''} ${page?.isFirstPage ? 'first-page' : ''} ${page?.isTOC ? 'toc-page' : ''} ${page?.hasFieldNotes ? 'field-notes-page' : ''} ${hasBackgroundImage ? 'has-background-image' : ''}`}
        style={pageStyle}
        data-chapter-index={page.chapterIndex}
        data-page-index={page.pageIndex}
      >
        {/* Background image as absolutely positioned element behind content */}
        {hasBackgroundImage && (
          <img
            src={page.isTOC ? paperTexture : page.backgroundImageUrl}
            alt=""
            className="pdf-page-background-image"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: page.isTOC ? 'center center' : 'left center',
              zIndex: 0,
              pointerEvents: 'none',
            }}
          />
        )}
        <section className="page-body content-body" style={{ position: 'relative', zIndex: 1 }}>
          {page?.isTOC ? (
            <DesktopTOC
              chapters={chapters}
              pages={pages}
              currentChapterIndex={currentChapterIndex}
              currentPageIndex={currentPageIndex}
              currentSubchapterId={currentSubchapterId}
              onJumpToPage={(chapterIndex, pageIndex) => {
                // Scroll to the target page using data attributes
                requestAnimationFrame(() => {
                  const allPageSheets = document.querySelectorAll('.page-sheet');
                  allPageSheets.forEach((sheet) => {
                    const sheetChapterIndex = parseInt(sheet.getAttribute('data-chapter-index'));
                    const sheetPageIndex = parseInt(sheet.getAttribute('data-page-index'));
                    if (sheetChapterIndex === chapterIndex && sheetPageIndex === pageIndex) {
                      sheet.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                  });
                });
                
                // Call original callback for bookmark saving
                if (onJumpToPage) {
                  onJumpToPage({ chapterIndex, pageIndex });
                }
              }}
              onEditChapter={onEditChapter}
              onAddSubchapter={onAddSubchapter}
              onDeleteChapter={onDeleteChapter}
              onEditSubchapter={onEditSubchapter}
              onDeleteSubchapter={onDeleteSubchapter}
              onReorderChapters={onReorderChapters}
            />
          ) : page?.isCover ? (
            <div 
              className="page-content"
              dangerouslySetInnerHTML={{ __html: page.content || '' }}
            />
          ) : page?.isFirstPage ? (
            <div 
              className="page-content"
              dangerouslySetInnerHTML={{ __html: page.content || '' }}
            />
          ) : page?.isEpigraph ? (
            <div className="page-content epigraph-content">
              <div className={`epigraph-text epigraph-align-${page?.epigraphAlign || 'center'}`}>
                <div>{page?.epigraphText || ''}</div>
                {page?.epigraphAuthor && (
                  <div className="epigraph-author">– {page.epigraphAuthor}</div>
                )}
              </div>
            </div>
          ) : page?.isVideo ? (
            <div className="page-content video-content">
              <video
                src={page?.videoSrc}
                loop
                muted
                playsInline
                preload="auto"
                className="fullscreen-video"
              />
            </div>
          ) : page?.hasFieldNotes ? (
            <div 
              className="page-content field-notes-content"
              dangerouslySetInnerHTML={{ __html: page?.content || '' }} 
            />
          ) : (
            <div 
              className="page-content"
              dangerouslySetInnerHTML={{ __html: page?.content || '' }} 
            />
          )}
        </section>
        {!page?.isFirstPage && !page?.isCover && !page?.isTOC && (
          <div className="page-number">
            {displayPageNumber}
          </div>
        )}
        {shouldShowTopBar && !page.hasFieldNotes && (
          <ReaderTopBar
            chapterTitle={page.chapterTitle}
            subchapterTitle={page.subchapterTitle}
            pageKey={pageKey}
          />
        )}
      </article>
    );
  };

  // Render pages vertically (stacked one after another)
  console.log('[DesktopPageReader] Rendering', pagesWithTOC.length, 'pages vertically (including TOC)');
  
  return (
    <>
      <PDFViewer
        currentPage={1}
        totalPages={pagesWithTOC.length}
        onPageChange={(pageNum) => {
          // Scroll to the page
          const pageIndex = pageNum - 1;
          const page = pagesWithTOC[pageIndex];
          if (page) {
            const pageElement = document.getElementById(`pdf-page-${pageIndex}`);
            if (pageElement) {
              pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }
        }}
        filename="weird-attachments.pdf"
      >
        <div className="pdf-pages-container">
          {pagesWithTOC.map((page, index) => {
            return (
              <div
                key={`page-${index}`}
                id={`pdf-page-${index}`}
                className="pdf-page-wrapper"
              >
                {renderPage(page, index, pagesWithTOC)}
              </div>
            );
          })}
        </div>
      </PDFViewer>
      {/* Desktop Progress Bar - only show for regular pages */}
      {mostVisiblePage && !mostVisiblePage.isFirstPage && !mostVisiblePage.isCover && !mostVisiblePage.isTOC && chapterProgress > 0 && typeof document !== 'undefined' && createPortal(
        <div className="chapter-progress-bar desktop-progress-bar">
          <div 
            className="chapter-progress-fill" 
            style={{ width: `${chapterProgress * 100}%` }}
          />
        </div>,
        document.body
      )}
    </>
  );
};

