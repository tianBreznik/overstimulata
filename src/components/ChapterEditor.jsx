import { useState, useEffect, useRef } from 'react';
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
  const autosaveTimerRef = useRef(null);

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
              placeholder="new chapter"
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
                {saving ? 'Saving…' : 'Save Draft'}
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
    </div>
  );
};
