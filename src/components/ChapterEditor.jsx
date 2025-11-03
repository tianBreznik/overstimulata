import { useState, useEffect, useRef, useLayoutEffect } from 'react';
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
  const colorInputRef = useRef(null);
  const userChangedColorRef = useRef(false); // Track when user manually changes color
  const [showVideoDialog, setShowVideoDialog] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');

  // Extract color from HTML string (for initial load)
  // Finds colors in <p> and <span> elements and returns the LAST one found
  const extractColorFromHTML = (html) => {
    if (!html) return '#000000';
    try {
      console.log('extractColorFromHTML - Input HTML:', html);
      let lastColor = '#000000';
      
      // Helper to convert color to hex and normalize to 6-digit format
      const colorToHex = (color) => {
        const trimmed = color.trim();
        if (trimmed.startsWith('rgb')) {
          const rgb = trimmed.match(/\d+/g);
          if (rgb && rgb.length >= 3) {
            const hex = '#' + rgb.slice(0, 3).map(x => {
              const val = parseInt(x);
              return (val < 16 ? '0' : '') + val.toString(16);
            }).join('');
            return normalizeHex(hex);
          }
        }
        if (trimmed.startsWith('#')) {
          return normalizeHex(trimmed);
        }
        return null;
      };
      
      // Normalize hex color to 6-digit format (e.g., #f00 -> #ff0000, #ff0000ff -> #ff0000)
      const normalizeHex = (hex) => {
        if (!hex || !hex.startsWith('#')) return null;
        // Remove # and convert to uppercase
        let clean = hex.slice(1).toLowerCase();
        // Handle 3-digit hex (e.g., #f00 -> #ff0000)
        if (clean.length === 3) {
          clean = clean.split('').map(c => c + c).join('');
        }
        // Take only first 6 characters (ignore alpha channel if present)
        if (clean.length >= 6) {
          clean = clean.slice(0, 6);
        }
        // Ensure it's exactly 6 characters
        if (clean.length < 6) {
          clean = clean.padEnd(6, '0');
        }
        return '#' + clean;
      };
      
      // Find all <p> and <span> tags (including self-closing and with attributes)
      const allTags = html.matchAll(/<(p|span)([^>]*)>/gi);
      
      for (const match of allTags) {
        const fullTag = match[0];
        const attributes = match[2] || '';
        
        console.log('Found tag:', fullTag);
        
        // Extract color from style attribute - improved regex
        // Match: style="color: #ff0000" or style='color: rgb(255,0,0)' or style="...color: red..."
        const styleAttrMatch = attributes.match(/style\s*=\s*["']([^"']*)["']/i);
        if (styleAttrMatch && styleAttrMatch[1]) {
          const styleContent = styleAttrMatch[1];
          // Look for color property in style
          const colorMatch = styleContent.match(/color\s*:\s*([^;]+)/i);
          if (colorMatch && colorMatch[1]) {
            const colorValue = colorMatch[1].trim();
            console.log('Found color in style:', colorValue);
            const hex = colorToHex(colorValue);
            if (hex && hex !== '#000000') {
              console.log('Setting lastColor to:', hex);
              lastColor = hex;
            }
          }
        }
        
        // Also check for <font color="..."> format
        const fontColorMatch = attributes.match(/color\s*=\s*["']([^"']+)["']/i);
        if (fontColorMatch && fontColorMatch[1]) {
          const colorValue = fontColorMatch[1].trim();
          console.log('Found color attribute:', colorValue);
          const hex = colorToHex(colorValue);
          if (hex && hex !== '#000000') {
            console.log('Setting lastColor to:', hex);
            lastColor = hex;
          }
        }
      }
      
      // Normalize the final color to ensure it's in correct format
      const finalColor = lastColor !== '#000000' ? normalizeHex(lastColor) || '#000000' : '#000000';
      console.log('extractColorFromHTML - Final color:', finalColor);
      return finalColor;
    } catch (error) {
      console.error('extractColorFromHTML error:', error);
      return '#000000';
    }
  };

  // Get current text color from selection/computed style
  const getCurrentTextColor = () => {
    try {
      const editor = textareaRef.current;
      if (!editor) return '#000000';
      
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        // If no selection, try to get color from the last element or cursor position
        // Place cursor at end and check
        try {
          const range = document.createRange();
          range.selectNodeContents(editor);
          range.collapse(false);
          const tempSel = window.getSelection();
          tempSel.removeAllRanges();
          tempSel.addRange(range);
          
          // Now check the color at cursor position
          const range2 = tempSel.getRangeAt(0);
          let element = range2.commonAncestorContainer;
          
          if (element.nodeType === Node.TEXT_NODE) {
            element = element.parentElement;
          }
          
          if (element) {
            return getColorFromElement(element);
          }
        } catch {}
        return '#000000';
      }
      
      const range = selection.getRangeAt(0);
      let element = range.commonAncestorContainer;
      
      // If it's a text node, get its parent element
      if (element.nodeType === Node.TEXT_NODE) {
        element = element.parentElement;
      } else if (element.nodeType === Node.ELEMENT_NODE) {
        element = element;
      } else {
        return '#000000';
      }
      
      if (!element) return '#000000';
      
      return getColorFromElement(element);
    } catch {
      return '#000000';
    }
  };

  // Helper to extract color from an element
  const getColorFromElement = (element) => {
    if (!element) return '#000000';
    
    // Walk up the DOM to find the first element with explicit color
    let current = element;
    while (current && current !== textareaRef.current) {
      // Check if this element has inline color style first (most specific)
      if (current.style && current.style.color && current.style.color !== '') {
        const color = current.style.color;
        // Convert rgb/rgba to hex if needed
        if (color.startsWith('rgb')) {
          const rgb = color.match(/\d+/g);
          if (rgb && rgb.length >= 3) {
            const hex = '#' + rgb.slice(0, 3).map(x => {
              const val = parseInt(x);
              return (val < 16 ? '0' : '') + val.toString(16);
            }).join('');
            return hex;
          }
        }
        // If it's already hex or named color, return as-is
        if (color.startsWith('#')) {
          return color;
        }
      }
      
      // Check computed style
      const computedStyle = window.getComputedStyle(current);
      const color = computedStyle.color;
      
      // If color is not black/default, return it
      if (color && color !== 'rgb(0, 0, 0)' && color !== '#000000' && color !== '#000') {
        // Convert rgb/rgba to hex
        if (color.startsWith('rgb')) {
          const rgb = color.match(/\d+/g);
          if (rgb && rgb.length >= 3) {
            const hex = '#' + rgb.slice(0, 3).map(x => {
              const val = parseInt(x);
              return (val < 16 ? '0' : '') + val.toString(16);
            }).join('');
            return hex;
          }
        }
        return color;
      }
      
      current = current.parentElement;
    }
    
    return '#000000';
  };

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
      
      // Only sync color picker with current text color if user didn't just manually change it
      // This prevents the color picker from being overridden when user picks a new color
      if (!userChangedColorRef.current) {
        const currentColor = getCurrentTextColor();
        setTextColor(currentColor);
      }
    } catch {}
  };

  useEffect(() => {
    if (chapter) {
      setTitle(chapter.title);
      if (textareaRef.current) {
        // Get the HTML content from the chapter being edited
        // Check both contentHtml (from database) and content (mapped property)
        const content = chapter.contentHtml || chapter.content || '';
        console.log('ChapterEditor - Loading chapter content:', content);
        textareaRef.current.innerHTML = content;
        
        // After DOM is ready, detect color from the actual DOM (same way refreshToolbarState does)
        // This is more reliable than HTML parsing because it uses the same logic as when cursor moves
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setTimeout(() => {
              if (textareaRef.current) {
                // Place cursor at end (this creates a selection)
                const range = document.createRange();
                const sel = window.getSelection();
                range.selectNodeContents(textareaRef.current);
                range.collapse(false);
                sel.removeAllRanges();
                sel.addRange(range);
                
                // Small delay to ensure selection is applied
                setTimeout(() => {
                  // Now get the color from the DOM at the cursor position (same as refreshToolbarState)
                  const detectedColor = getCurrentTextColor();
                  console.log('ChapterEditor - Detected color from DOM:', detectedColor);
                  
                  // Update state first
                  setTextColor(detectedColor);
                  
                  // Then update DOM directly after React has a chance to update
                  setTimeout(() => {
                    if (colorInputRef.current) {
                      colorInputRef.current.value = detectedColor;
                      console.log('ChapterEditor - Set color input DOM value to:', detectedColor);
                      // Force update with both input and change events
                      colorInputRef.current.dispatchEvent(new Event('input', { bubbles: true }));
                      colorInputRef.current.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                    
                    // Refresh toolbar to sync all states (this will also call getCurrentTextColor again)
                    refreshToolbarState();
                  }, 0);
                }, 10);
              }
            }, 10);
          });
        });
      }
    } else if (parentChapter) {
      setTitle('');
      if (textareaRef.current) {
        textareaRef.current.innerHTML = '';
      }
      // Reset to black for new chapter
      setTextColor('#000000');
    }
  }, [chapter, parentChapter]);

  // Force color input to update visually immediately when textColor changes
  useLayoutEffect(() => {
    if (colorInputRef.current && textColor) {
      // Force update the color input's value to ensure visual representation updates
      // This runs synchronously before browser paint, so visual updates immediately
      const input = colorInputRef.current;
      if (input.value !== textColor) {
        input.value = textColor;
        // Force browser to update the visual swatch by triggering a reflow
        input.style.display = 'none';
        void input.offsetHeight; // force reflow
        input.style.display = '';
      }
    }
  }, [textColor]);

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
    const handleSelection = () => {
      // Don't sync if user just manually changed the color picker
      if (!userChangedColorRef.current) {
        refreshToolbarState();
      }
    };
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
    
    // Mark that user is manually changing the color - prevent refreshToolbarState from overriding
    // Set this BEFORE any operations that might trigger selection changes
    userChangedColorRef.current = true;
    
    // Update state immediately - useLayoutEffect will handle visual update
    setTextColor(value);
    
    // Force immediate visual update of the color picker swatch
    if (colorInputRef.current) {
      colorInputRef.current.value = value;
    }
    
    const editor = textareaRef.current;
    if (editor) {
      // Apply color to current selection/caret position BEFORE focusing
      // This way the color is applied to the caret position
      document.execCommand('foreColor', false, value);
      
      editor.focus();
      
      // Keep the flag true for longer to prevent any selection changes from overriding
      // Only reset after user starts typing or a significant delay
      setTimeout(() => {
        userChangedColorRef.current = false;
      }, 500); // Longer delay to prevent immediate override
      
      // Don't call refreshToolbarState here - it will override the color
      // Let it sync naturally when user types or moves cursor
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
                    ref={colorInputRef}
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
              onClick={refreshToolbarState}
              onFocus={refreshToolbarState}
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
