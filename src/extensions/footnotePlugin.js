import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { InputRule } from 'prosemirror-inputrules';

// Extension to handle ^["content"] syntax and auto-number footnotes
export const FootnotePlugin = Extension.create({
  name: 'footnote',
  
  addProseMirrorPlugins() {
    const footnoteKey = new PluginKey('footnote');
    
    return [
      new Plugin({
        key: footnoteKey,
        
        // Store footnote registry in plugin state
        state: {
          init() {
            return {
              footnotes: new Map(), // id -> { number, content }
              nextNumber: 1,
            };
          },
          apply(tr, value) {
            // Rebuild footnote registry from document
            const footnotes = new Map();
            let maxNumber = 0;
            
            tr.doc.descendants((node) => {
              if (node.type.name === 'footnoteRef') {
                const id = node.attrs.id;
                const number = node.attrs.number;
                if (id && number) {
                  footnotes.set(id, { number, content: null }); // Content stored separately
                  maxNumber = Math.max(maxNumber, number);
                }
              }
            });
            
            return {
              footnotes,
              nextNumber: maxNumber + 1,
            };
          },
        },
        
        // Watch for deletions and renumber
        appendTransaction(transactions, oldState, newState) {
          const tr = newState.tr;
          let modified = false;
          
          // Check if any footnoteRef nodes were deleted
          const oldRefs = new Set();
          oldState.doc.descendants((node) => {
            if (node.type.name === 'footnoteRef') {
              oldRefs.add(node.attrs.id);
            }
          });
          
          const newRefs = new Set();
          newState.doc.descendants((node) => {
            if (node.type.name === 'footnoteRef') {
              newRefs.add(node.attrs.id);
            }
          });
          
          // Find deleted footnotes
          const deleted = [...oldRefs].filter(id => !newRefs.has(id));
          
          if (deleted.length > 0) {
            // Collect all remaining footnotes and renumber
            const remaining = [];
            newState.doc.descendants((node, pos) => {
              if (node.type.name === 'footnoteRef') {
                remaining.push({ node, pos, id: node.attrs.id, number: node.attrs.number });
              }
            });
            
            // Sort by current number
            remaining.sort((a, b) => a.number - b.number);
            
            // Renumber sequentially
            remaining.forEach((ref, index) => {
              const newNumber = index + 1;
              if (ref.number !== newNumber) {
                tr.setNodeMarkup(ref.pos, null, {
                  ...ref.node.attrs,
                  number: newNumber,
                });
                modified = true;
                
                // Emit event for parent to update footnote registry
                const event = new CustomEvent('footnote-renumbered', {
                  detail: { id: ref.id, oldNumber: ref.number, newNumber },
                });
                document.dispatchEvent(event);
              }
            });
          }
          
          return modified ? tr : null;
        },
      }),
    ];
  },
  
  addInputRules() {
    return [
      new InputRule({
        // Match legacy markdown-style syntax: ^[content]
        // We allow anything except a closing bracket inside.
        find: /\^\[([^\]]+)\]$/,
        handler: ({ state, range, match }) => {
          const content = match[1]?.trim();
          if (!content) {
            return null;
          }
          
          // Find the highest footnote number in the document
          let maxNumber = 0;
          state.doc.descendants((node) => {
            if (node.type.name === 'footnoteRef' && node.attrs.number) {
              maxNumber = Math.max(maxNumber, node.attrs.number);
            }
          });
          
          const number = maxNumber + 1;
          const id = `fn-${number}`;
          
          // Create footnote reference node
          const footnoteNode = state.schema.nodes.footnoteRef.create({
            id,
            number,
            content,
          });
          
          // Replace the matched text with the footnote node
          const { from, to } = range;
          const tr = state.tr.replaceWith(from, to, footnoteNode);
          
          // Store footnote content (we'll need to store this separately in the document or component state)
          // For now, we'll emit an event that the parent component can handle
          const event = new CustomEvent('footnote-created', {
            detail: { id, number, content },
          });
          document.dispatchEvent(event);
          
          return tr;
        },
      }),
    ];
  },
});

