import { useState, useEffect } from 'react';
import './PDFTopBar.css';

/**
 * PDFTopBar - Classic PDF reader top bar with controls
 * Includes: download, page number, navigation, zoom, print
 */
export const PDFTopBar = ({
  currentPage,
  totalPages,
  filename = 'document.pdf',
  onPageChange,
  onPreviousPage,
  onNextPage,
  onZoomIn,
  onZoomOut,
  onFitToWidth,
  onFitToPage,
  onPrint,
  onDownload
}) => {
  const [pageInput, setPageInput] = useState(currentPage || 1);

  // Update page input when currentPage changes
  useEffect(() => {
    setPageInput(currentPage || 1);
  }, [currentPage]);

  const handlePageInputChange = (e) => {
    const value = e.target.value;
    setPageInput(value);
  };

  const handlePageInputBlur = () => {
    const pageNum = parseInt(pageInput);
    if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
      if (onPageChange) {
        onPageChange(pageNum);
      }
    } else {
      // Reset to current page if invalid
      setPageInput(currentPage || 1);
    }
  };

  const handlePageInputKeyDown = (e) => {
    if (e.key === 'Enter') {
      handlePageInputBlur();
      e.target.blur();
    }
  };

  const handlePreviousPage = () => {
    if (currentPage > 1 && onPreviousPage) {
      onPreviousPage();
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages && onNextPage) {
      onNextPage();
    }
  };

  return (
    <div className="pdf-top-bar">
      <div className="pdf-top-bar-left">
        {/* Zoom controls */}
        <button
          className="pdf-top-bar-btn"
          onClick={onZoomOut}
          title="Zoom out"
          aria-label="Zoom out"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M5 8L11 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>

        <button
          className="pdf-top-bar-btn"
          onClick={onZoomIn}
          title="Zoom in"
          aria-label="Zoom in"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M8 5L8 11M5 8L11 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      <div className="pdf-top-bar-center">
        {/* Previous page button */}
        <button
          className="pdf-top-bar-btn"
          onClick={handlePreviousPage}
          disabled={currentPage <= 1}
          title="Previous page"
          aria-label="Previous page"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        {/* Page number input */}
        <div className="pdf-page-number">
          <input
            type="text"
            value={pageInput}
            onChange={handlePageInputChange}
            onBlur={handlePageInputBlur}
            onKeyDown={handlePageInputKeyDown}
            className="pdf-page-input"
            aria-label="Page number"
          />
          <span className="pdf-page-total">/ {totalPages}</span>
        </div>

        {/* Next page button */}
        <button
          className="pdf-top-bar-btn"
          onClick={handleNextPage}
          disabled={currentPage >= totalPages}
          title="Next page"
          aria-label="Next page"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      <div className="pdf-top-bar-right">
        {/* Download button - icon only */}
        <button
          className="pdf-top-bar-btn"
          onClick={onDownload}
          title="Download PDF"
          aria-label="Download PDF"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M8 10L8 2M8 10L5 7M8 10L11 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M2 12L2 13C2 13.5523 2.44772 14 3 14L13 14C13.5523 14 14 13.5523 14 13L14 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
    </div>
  );
};

