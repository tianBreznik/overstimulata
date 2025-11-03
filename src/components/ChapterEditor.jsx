import { useState, useEffect, useRef } from 'react';
import { convertImageToBase64 } from '../services/storage';
import './ChapterEditor.css';

export const ChapterEditor = ({ chapter, parentChapter, onSave, onCancel, onDelete }) => {
  const [title, setTitle] = useState(chapter?.title || '');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [autosaveStatus, setAutosaveStatus] = useState('Ready');
  const [highlightColor, setHighlightColor] = useState('#ffeb3b');
  const [textColor, setTextColor] = useState('#000000');
  const [activeFormats, setActiveFormats] = useState({
    bold: false,
    italic: false,
    strikethrough: false,
    underline: false,
    highlight: false,
    textColor: false
  });
  const textareaRef = useRef(null);
  const imageInputRef = useRef(null);
  const autosaveTimerRef = useRef(null);
  const [showVideoDialog, setShowVideoDialog] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');

  const refreshToolbarState = () => {
    try {
      const state = {
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        strikethrough: document.queryCommandState('strikeThrough'),
        underline: document.queryCommandState('underline'),
        // alignment states (only one likely true)
        alignLeft: document.queryCommandState('justifyLeft'),
        alignCenter: document.queryCommandState('justifyCenter'),
        alignRight: document.queryCommandState('justifyRight'),
      };
      setActiveFormats(prev => ({ ...prev, ...state }));
    } catch {}
  };

  useEffect(() => {
    if (chapter) {
      setTitle(chapter.title);
      if (textareaRef.current) {
        textareaRef.current.innerHTML = chapter.content || '';
      }
    } else if (parentChapter) {
      setTitle('');
      if (textareaRef.current) {
        textareaRef.current.innerHTML = '';
      }
    }
  }, [chapter, parentChapter]);

  // Handle content changes from contentEditable for autosave
  const handleEditorInput = () => {
    if (!textareaRef.current) return;
    const html = textareaRef.current.innerHTML;
    setContent(html);
  };

  // Debounced local autosave
  useEffect(() => {
    // Skip initial mount when no title and no content
    if (!title && !content) return;
    setAutosaveStatus('Saving draft...');
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }
    autosaveTimerRef.current = setTimeout(() => {
      try {
        const key = `draft:${chapter?.id || parentChapter?.id || 'new'}`;
        const data = { title, content, ts: Date.now() };
        localStorage.setItem(key, JSON.stringify(data));
        setAutosaveStatus('Draft saved');
      } catch (e) {
        setAutosaveStatus('Draft save failed');
      }
    }, 800);
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [title, content, chapter?.id, parentChapter?.id]);

  // Sync toolbar with selection changes
  useEffect(() => {
    const handleSelection = () => refreshToolbarState();
    document.addEventListener('selectionchange', handleSelection);
    return () => document.removeEventListener('selectionchange', handleSelection);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e) => {
      if (!textareaRef.current) return;
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      switch (e.key.toLowerCase()) {
        case 'b': e.preventDefault(); document.execCommand('bold'); refreshToolbarState(); break;
        case 'i': e.preventDefault(); document.execCommand('italic'); refreshToolbarState(); break;
        case 'u': e.preventDefault(); document.execCommand('underline'); refreshToolbarState(); break;
        case 'l': e.preventDefault(); document.execCommand('justifyLeft'); refreshToolbarState(); break;
        case 'e': e.preventDefault(); document.execCommand('justifyCenter'); refreshToolbarState(); break;
        case 'r': e.preventDefault(); document.execCommand('justifyRight'); refreshToolbarState(); break;
        default: break;
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const currentContent = textareaRef.current ? textareaRef.current.innerHTML : '';
    console.log('Saving data:', { title, contentHtml: currentContent });
    await onSave({ title, contentHtml: currentContent });
    setSaving(false);
  };

  const handleDelete = async () => {
    if (window.confirm('Are you sure you want to delete this chapter?')) {
      await onDelete(chapter?.id);
      onCancel();
    }
  };


  const toggleFormatting = (formatType, command, value = null) => {
    const editor = textareaRef.current;
    if (!editor) return;
    
    editor.focus();
    
    document.execCommand(command, false, value);
    
    editor.focus();
    refreshToolbarState();
  };

  const applyBold = () => toggleFormatting('bold', 'bold');
  const applyItalic = () => toggleFormatting('italic', 'italic');
  const applyStrikethrough = () => toggleFormatting('strikethrough', 'strikeThrough');
  const applyUnderline = () => toggleFormatting('underline', 'underline');
  const applyHighlight = () => {
    const editor = textareaRef.current;
    if (!editor) return;
    editor.focus();
    try { document.execCommand('styleWithCSS', false, true); } catch {}
    document.execCommand('hiliteColor', false, highlightColor);
    refreshToolbarState();
  };
  const applyTextColor = () => toggleFormatting('textColor', 'foreColor', textColor);
  const alignLeft = () => toggleFormatting('alignLeft', 'justifyLeft');
  const alignCenter = () => toggleFormatting('alignCenter', 'justifyCenter');
  const alignRight = () => toggleFormatting('alignRight', 'justifyRight');

  const handleTextColorChange = (e) => {
    const value = e.target.value;
    setTextColor(value);
    const editor = textareaRef.current;
    if (editor) {
      editor.focus();
      document.execCommand('foreColor', false, value);
      refreshToolbarState();
    }
  };

  const handleHighlightColorChange = (e) => {
    const value = e.target.value;
    setHighlightColor(value);
    // Immediately apply new highlight color to selection/caret
    const editor = textareaRef.current;
    if (editor) {
      editor.focus();
      try { document.execCommand('styleWithCSS', false, true); } catch {}
      document.execCommand('hiliteColor', false, value);
      refreshToolbarState();
    }
  };

  const handleApplyHighlightClick = (e) => {
    const editor = textareaRef.current;
    if (!editor) return;
    e.preventDefault();
    editor.focus();
    try { document.execCommand('styleWithCSS', false, true); } catch {}
    if (e.altKey) {
      document.execCommand('hiliteColor', false, 'transparent');
    } else {
      document.execCommand('hiliteColor', false, highlightColor);
    }
    refreshToolbarState();
  };

  const handleImageButtonClick = () => {
    if (imageInputRef.current) imageInputRef.current.click();
  };

  const handleVideoButtonClick = () => {
    setShowVideoDialog(true);
    setVideoUrl('');
  };

  const convertVideoUrlToEmbed = (url) => {
    // YouTube - handles various formats, use nocookie domain to reduce branding
    const youtubeRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const youtubeMatch = url.match(youtubeRegex);
    if (youtubeMatch) {
      return `<iframe width="560" height="315" src="https://www.youtube-nocookie.com/embed/${youtubeMatch[1]}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="max-width:100%;height:auto;display:block;margin:8px 0;"></iframe>`;
    }

    // Vimeo
    const vimeoRegex = /(?:vimeo\.com\/)(?:channels\/|groups\/[^\/]*\/videos\/|album\/\d+\/video\/|video\/|)(\d+)/;
    const vimeoMatch = url.match(vimeoRegex);
    if (vimeoMatch) {
      return `<iframe src="https://player.vimeo.com/video/${vimeoMatch[1]}" width="560" height="315" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen style="max-width:100%;height:auto;display:block;margin:8px 0;"></iframe>`;
    }

    // If no match, return as-is (user might paste custom embed code)
    return url;
  };

  const handleInsertVideo = () => {
    if (!videoUrl.trim()) return;
    
    const editor = textareaRef.current;
    if (!editor) return;

    const embedHtml = convertVideoUrlToEmbed(videoUrl.trim());
    
    editor.focus();
    try {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0 && editor.contains(selection.anchorNode)) {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        const temp = document.createElement('div');
        temp.innerHTML = embedHtml;
        const frag = document.createDocumentFragment();
        let node, lastNode;
        while ((node = temp.firstChild)) {
          lastNode = frag.appendChild(node);
        }
        range.insertNode(frag);
        if (lastNode) {
          const after = document.createTextNode('\u00A0');
          lastNode.parentNode.insertBefore(after, lastNode.nextSibling);
          const newRange = document.createRange();
          newRange.setStartAfter(after);
          newRange.collapse(true);
          selection.removeAllRanges();
          selection.addRange(newRange);
        }
      } else {
        editor.insertAdjacentHTML('beforeend', embedHtml);
      }
    } catch {
      document.execCommand('insertHTML', false, embedHtml);
    }
    
    setShowVideoDialog(false);
    setVideoUrl('');
    refreshToolbarState();
  };

  const handleImageSelected = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUri = await convertImageToBase64(file);
      const editor = textareaRef.current;
      if (!editor) return;
      editor.focus();
      const imgHtml = `<img src="${dataUri}" alt="" style="max-width:100%;height:auto;display:block;margin:8px 0;" />`;
      try {
        // Prefer modern Selection/Range insertion
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0 && editor.contains(selection.anchorNode)) {
          const range = selection.getRangeAt(0);
          range.deleteContents();
          const temp = document.createElement('div');
          temp.innerHTML = imgHtml;
          const frag = document.createDocumentFragment();
          let node, lastNode;
          while ((node = temp.firstChild)) {
            lastNode = frag.appendChild(node);
          }
          range.insertNode(frag);
          // Move caret after inserted image
          if (lastNode) {
            const after = document.createTextNode('\u00A0');
            lastNode.parentNode.insertBefore(after, lastNode.nextSibling);
            const newRange = document.createRange();
            newRange.setStartAfter(after);
            newRange.collapse(true);
            selection.removeAllRanges();
            selection.addRange(newRange);
          }
        } else {
          // Fallback: append at end of editor
          editor.insertAdjacentHTML('beforeend', imgHtml);
        }
      } catch {
        // Legacy fallback
        document.execCommand('insertHTML', false, imgHtml);
      }
      refreshToolbarState();
    } catch (err) {
      console.error('Image conversion failed', err);
      alert(err.message || 'Image conversion failed. Please try a smaller image.');
    } finally {
      // reset input so selecting the same file again still triggers change
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  return (
    <div className="editor-overlay side-panel">
      <div className="editor-modal side-panel-modal">
        <button className="close-btn close-top" onClick={onCancel}>✕</button>
        
        <div className="editor-content">
          <div className="title-row">
            <input
              id="chapter-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="naslov poglavja"
              className="title-input"
            />
          </div>

          <div className="page-frame">
            <div className="editor-toolbar attached">
              <div className="toolbar-buttons">
                <button 
                  onClick={applyBold}
                  className={`toolbar-btn ${activeFormats.bold ? 'active' : ''}`}
                  title="Bold"
                >
                  <strong>B</strong>
                </button>
                <button 
                  onClick={applyItalic}
                  className={`toolbar-btn ${activeFormats.italic ? 'active' : ''}`}
                  title="Italic"
                >
                  <em>I</em>
                </button>
                <button 
                  onClick={applyStrikethrough}
                  className={`toolbar-btn ${activeFormats.strikethrough ? 'active' : ''}`}
                  title="Strikethrough"
                >
                  <span style={{textDecoration: 'line-through'}}>S</span>
                </button>
                <button 
                  onClick={applyUnderline}
                  className={`toolbar-btn ${activeFormats.underline ? 'active' : ''}`}
                  title="Underline"
                >
                  <span style={{textDecoration: 'underline'}}>U</span>
                </button>
                <button
                  onClick={handleImageButtonClick}
                  className="toolbar-btn"
                  title="Insert Image"
                >
                  🖼
                </button>
                <input ref={imageInputRef} type="file" accept="image/*" onChange={handleImageSelected} style={{ display: 'none' }} />
                <button
                  onClick={handleVideoButtonClick}
                  className="toolbar-btn"
                  title="Insert Video (YouTube/Vimeo)"
                >
                  🎥
                </button>
                {/* Text color picker (no button) */}
                <div className="color-group">
                  <input
                    type="color"
                    value={textColor}
                    onChange={handleTextColorChange}
                    className="color-input"
                    title="Text Color"
                  />
                </div>
                {/* Highlight H-swatch next to text color */}
                <div className="highlight-picker-container" title="Highlight (click to apply, Alt-click to clear)">
                  <input
                    type="color"
                    value={highlightColor}
                    onChange={handleHighlightColorChange}
                    className="highlight-picker"
                  />
                  <button className="highlight-overlay" style={{ color: textColor }} onMouseDown={(e)=>e.preventDefault()} onClick={handleApplyHighlightClick}>H</button>
                </div>
                <span className="toolbar-sep" />
                <button 
                  onClick={alignLeft}
                  className="toolbar-btn"
                  title="Align Left"
                >
                  ⬑
                </button>
                <button 
                  onClick={alignCenter}
                  className="toolbar-btn"
                  title="Align Center"
                >
                  ≡
                </button>
                <button 
                  onClick={alignRight}
                  className="toolbar-btn"
                  title="Align Right"
                >
                  ⬏
                </button>
                
              </div>
              <div className="toolbar-status">{autosaveStatus}</div>
            </div>
            <div className="ruler">
              <div className="ruler-track">
                {Array.from({ length: 24 }).map((_, i) => (
                  <span key={i} className="ruler-num">{i + 1}</span>
                ))}
              </div>
            </div>
            <div className="floating-actions">
              <button 
                className="btn-save btn-floating" 
                onClick={handleSave}
                disabled={!title.trim() || saving}
              >
                {saving ? 'Publishing…' : 'Publish'}
              </button>
            </div>
            <div 
              className="content-editor page-area"
              contentEditable
              ref={textareaRef}
              onInput={handleEditorInput}
              suppressContentEditableWarning={true}
            />
          </div>

          {/* shortcuts removed per design */}
        </div>

        {/* bottom actions removed in favor of floating save */}
      </div>

      {/* Video embed dialog */}
      {showVideoDialog && (
        <div className="video-dialog-overlay" onClick={(e) => {
          if (e.target === e.currentTarget) setShowVideoDialog(false);
        }}>
          <div className="video-dialog">
            <h3>Insert Video</h3>
            <p style={{ fontSize: '12px', color: '#666', marginBottom: '12px' }}>
              Paste a YouTube or Vimeo URL, or embed code
            </p>
            <input
              type="text"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="video-url-input"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleInsertVideo();
                if (e.key === 'Escape') setShowVideoDialog(false);
              }}
              autoFocus
            />
            <div className="video-dialog-actions">
              <button onClick={() => setShowVideoDialog(false)} className="btn-cancel">
                Cancel
              </button>
              <button onClick={handleInsertVideo} className="btn-save" disabled={!videoUrl.trim()}>
                Insert
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
