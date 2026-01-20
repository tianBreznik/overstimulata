/**
 * Karaoke helper utilities
 * Functions for text processing, timing assignment, and slice initialization
 */

export const normalizeWord = (value) => {
  if (!value) return '';
  return value
    .normalize('NFKD')
    .replace(/'/g, "'")
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9']+/g, '');
};

export const tokenizeText = (text) => {
  const tokens = [];
  // Use compatible regex without Unicode property escapes for older Safari support
  const TOKEN_REGEX = /[a-zA-Z0-9\u00C0-\u017F\u0400-\u04FF\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF''']+/gu;
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

export const assignLetterTimingsToChars = (text, wordTimings = []) => {
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
 * Initialize a karaoke slice by wrapping words in spans for highlighting
 * This is extracted from PageReader.jsx for reuse in the hook
 */
export const ensureWordSliceInitialized = async (karaokeSources, karaokeId, sliceElement, startChar, endChar) => {
  if (!sliceElement || !sliceElement.isConnected) {
    return false;
  }

  if (sliceElement.querySelectorAll('.karaoke-word').length > 0) {
    return true;
  }

  const source = karaokeSources[karaokeId];
  if (!source) {
    return false;
  }

  // Use the source text directly for this slice to preserve newlines.
  // IMPORTANT: This text NOW contains soft hyphens (\u00AD) from programmatic hyphenation.
  const sourceText = source.text || '';
  const sliceStart = startChar;
  const sliceEnd = typeof endChar === 'number' ? endChar : sliceStart + sourceText.length;
  let text = sourceText.slice(sliceStart, sliceEnd);
  // Normalize apostrophes to match the original text format used in tokenization
  text = text.replace(/'/g, "'");
  if (!text.trim()) {
    return false;
  }

  const fragment = document.createDocumentFragment();
  const wordMetadata = source.wordCharRanges || [];

  let localCursor = 0;
  wordMetadata.forEach((word, wordIndex) => {
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
      // Convert newlines to <br> elements when appending text
      const textBeforeWord = text.slice(localCursor, localStart);
      const parts = textBeforeWord.split('\n');
      parts.forEach((part, idx) => {
        if (idx > 0) {
          const br = document.createElement('br');
          fragment.appendChild(br);
        }
        if (part) {
          fragment.appendChild(document.createTextNode(part));
        }
      });
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
    wordSpan.appendChild(document.createTextNode(wordText));

    // Check if there's punctuation immediately after this word
    const nextWord = wordMetadata[wordIndex + 1];
    const nextWordStart = nextWord ? Math.max(0, nextWord.charStart - sliceStart) : text.length;
    const textAfterWord = text.slice(localEnd, nextWordStart);
    
    const punctuationMatch = textAfterWord.match(/^([.,!?;:]+)/);
    if (punctuationMatch) {
      const punctuation = punctuationMatch[1];
      punctuation.split('').forEach((punct) => {
        const punctSpan = document.createElement('span');
        punctSpan.className = 'karaoke-char karaoke-punctuation';
        punctSpan.style.whiteSpace = 'nowrap';
        punctSpan.style.display = 'inline';
        punctSpan.textContent = punct;
        punctSpan.dataset.char = punct;
        wordSpan.appendChild(punctSpan);
      });
      localCursor = localEnd + punctuation.length;
    } else {
      localCursor = localEnd;
    }
    
    // Handle spaces after punctuation
    if (localCursor < text.length && localCursor < nextWordStart) {
      const nextChar = text[localCursor];
      if (nextChar === ' ' && localCursor + 1 < text.length) {
        const charAfterSpace = text[localCursor + 1];
        if (/[.,!?;:]/.test(charAfterSpace)) {
          const spaceSpan = document.createElement('span');
          spaceSpan.className = 'karaoke-char';
          spaceSpan.style.whiteSpace = 'nowrap';
          spaceSpan.textContent = ' ';
          spaceSpan.dataset.char = '\u00A0';
          wordSpan.appendChild(spaceSpan);
          localCursor++;
        }
      }
    }

    fragment.appendChild(wordSpan);
    
    // Handle remaining text after the word
    if (localCursor < nextWordStart) {
      const remainingAfterText = text.slice(localCursor, nextWordStart);
      const remainingParts = remainingAfterText.split('\n');
      remainingParts.forEach((part, partIdx) => {
        if (partIdx > 0) {
          fragment.appendChild(document.createElement('br'));
        }
        if (part) {
          fragment.appendChild(document.createTextNode(part));
        }
      });
      localCursor = nextWordStart;
    } else {
      localCursor = nextWordStart;
    }
  });

  if (localCursor < text.length) {
    const remainingText = text.slice(localCursor);
    const parts = remainingText.split('\n');
    parts.forEach((part, idx) => {
      if (idx > 0) {
        fragment.appendChild(document.createElement('br'));
      }
      if (part) {
        fragment.appendChild(document.createTextNode(part));
      }
    });
  }

  // Wait for layout to stabilize
  await new Promise(resolve => {
    const checkStability = () => {
      if (!sliceElement || !sliceElement.isConnected) {
        resolve();
        return;
      }
      
      const currentHeight = sliceElement.getBoundingClientRect().height;
      const currentTop = sliceElement.getBoundingClientRect().top;
      
      if (Math.abs(currentHeight - (previousHeight || 0)) < 0.5 && 
          Math.abs(currentTop - (previousTop || currentTop)) < 0.5) {
        stableCount++;
        if (stableCount >= requiredStableFrames) {
          resolve();
          return;
        }
      } else {
        stableCount = 0;
      }
      
      previousHeight = currentHeight;
      previousTop = currentTop;
      
      requestAnimationFrame(() => {
        requestAnimationFrame(checkStability);
      });
    };
    
    let previousHeight = 0;
    let previousTop = 0;
    let stableCount = 0;
    const requiredStableFrames = 3;
    
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(() => {
          checkStability();
        }, 100);
      });
    });
  });

  sliceElement.innerHTML = '';
  sliceElement.appendChild(fragment);
  
  // Force a reflow
  void sliceElement.offsetHeight;
  
  return true;
};

