// Simple markdown renderer for basic formatting
export function renderMarkdown(text) {
  if (!text) return '';
  
  console.log('Original text:', text);
  
  let result = text
    // Headers first (before other processing)
    .replace(/^# (.*)$/gm, '<h1>$1</h1>')
    .replace(/^## (.*)$/gm, '<h2>$1</h2>')
    .replace(/^### (.*)$/gm, '<h3>$1</h3>');
    
  console.log('After header processing:', result);
    
  result = result
    // Bold: **text** -> <strong>text</strong>
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Italic: *text* -> <em>text</em> (but not **text**)
    .replace(/(?<!\*)\*([^*\s]+(?:\s+[^*\s]+)*?)\*(?!\*)/g, '<em>$1</em>')
    // Highlighting: ==text== -> <mark>text</mark>
    .replace(/==(.*?)==/g, '<mark>$1</mark>')
    // Custom highlight colors: ==color:text== -> <mark style="background-color: color">text</mark>
    .replace(/==([^:]+):(.*?)==/g, '<mark style="background-color: $1">$2</mark>')
    // Strikethrough: -text- -> <del>text</del> (but not in HTML attributes)
    .replace(/(?<!["\w])-([^-\s]+(?:\s+[^-\s]+)*?)-(?!["\w])/g, '<del>$1</del>')
    // Line breaks: double newline -> paragraph break
    .replace(/\n\n/g, '</p><p>')
    // Single newlines: -> <br>
    .replace(/\n/g, '<br>');
    
  console.log('Final result:', result);
  return result;
}

export function renderMarkdownWithParagraphs(text) {
  if (!text) return '';
  
  console.log('renderMarkdownWithParagraphs - Original text:', text);
  
  // Check if content already contains HTML tags (from editor with formatting)
  const hasHtmlTags = /<[^>]+>/.test(text);
  
  if (hasHtmlTags) {
    // Content is already HTML from the editor - return as-is, but ensure it's wrapped in <p> if needed
    const trimmed = text.trim();
    const startsWithBlockTag = trimmed.match(/^<(p|h[1-6]|div|ul|ol|blockquote)/i);
    
    if (!startsWithBlockTag) {
      // Wrap HTML content in <p> if it doesn't start with a block tag
      return `<p>${trimmed}</p>`;
    }
    return trimmed;
  }
  
  // Process custom large text syntax: #text -> <span class="large-text">text</span>
  let result = text
    .replace(/#([^\s#][^#]*?)(?=\s|$)/g, '<span class="large-text">$1</span>');
    
  console.log('After large text processing:', result);
  
  // Now render the rest of the markdown
  result = renderMarkdown(result);
  
  // Ensure content is wrapped in <p> tags if it's not already
  const trimmed = result.trim();
  const startsWithBlockTag = trimmed.match(/^<(p|h[1-6]|div|ul|ol|blockquote)/i);
  
  if (trimmed && !startsWithBlockTag) {
    // Wrap in <p> if it's not already wrapped
    result = `<p>${trimmed}</p>`;
  }
  
  console.log('Final result from renderMarkdownWithParagraphs:', result);
  return result;
}
