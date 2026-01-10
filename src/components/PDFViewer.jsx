import './PDFViewer.css';

/**
 * PDFViewer - Wrapper component for desktop PDF-style page viewing
 * Provides scrollable container for multiple pages
 */
export const PDFViewer = ({ children, currentPage, totalPages, onPageChange, filename }) => {
  return (
    <div className="pdf-viewer">
      <div className="pdf-viewer-container">
        {children}
      </div>
    </div>
  );
};

