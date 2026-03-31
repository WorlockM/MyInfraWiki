import React, { useEffect, useState } from 'react';
import { Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, useCurrentEditor } from '@tiptap/react';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    tableOfContents: {
      insertTableOfContents: () => ReturnType
    }
  }
}

interface HeadingItem {
  level: number;
  text: string;
}

function TableOfContentsComponent() {
  const { editor } = useCurrentEditor();
  const [headings, setHeadings] = useState<HeadingItem[]>([]);

  useEffect(() => {
    if (!editor) return;

    const updateHeadings = () => {
      const items: HeadingItem[] = [];
      editor.state.doc.descendants((node) => {
        if (node.type.name === 'heading') {
          items.push({
            level: node.attrs.level as number,
            text: node.textContent,
          });
        }
      });
      setHeadings(items);
    };

    updateHeadings();
    editor.on('update', updateHeadings);
    return () => {
      editor.off('update', updateHeadings);
    };
  }, [editor]);

  const handleHeadingClick = (text: string) => {
    const editorEl = document.querySelector('.tiptap-editor');
    if (!editorEl) return;
    const headingEls = editorEl.querySelectorAll('h1, h2, h3, h4, h5, h6');
    for (const el of Array.from(headingEls)) {
      if (el.textContent?.trim() === text.trim()) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        break;
      }
    }
  };

  return (
    <NodeViewWrapper className="toc-node" contentEditable={false}>
      <div className="toc-node__title">Table of Contents</div>
      {headings.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0 }}>
          No headings found
        </p>
      ) : (
        <ol>
          {headings.map((h, i) => (
            <li key={i} style={{ paddingLeft: `${(h.level - 1) * 12}px` }}>
              <a
                className="toc-node__item"
                onClick={() => handleHeadingClick(h.text)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && handleHeadingClick(h.text)}
              >
                {h.text || '(empty heading)'}
              </a>
            </li>
          ))}
        </ol>
      )}
    </NodeViewWrapper>
  );
}

export const TableOfContentsExtension = Node.create({
  name: 'tableOfContents',
  group: 'block',
  atom: true,

  parseHTML() {
    return [{ tag: 'div[data-type="table-of-contents"]' }];
  },

  renderHTML() {
    return ['div', { 'data-type': 'table-of-contents' }, 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TableOfContentsComponent);
  },

  addCommands() {
    return {
      insertTableOfContents:
        () =>
        ({ commands }) => {
          return commands.insertContent({ type: this.name });
        },
    };
  },
});
