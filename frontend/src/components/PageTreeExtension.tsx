import React, { useEffect, useState } from 'react';
import { Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, useCurrentEditor } from '@tiptap/react';
import axios from 'axios';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pageTree: {
      insertPageTree: () => ReturnType
    }
  }
}

interface PageItem {
  id: string;
  title: string;
  parent_id: string | null;
}

function PageTreeComponent() {
  const { editor } = useCurrentEditor();
  const [childPages, setChildPages] = useState<PageItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!editor) return;

    const currentPageId: string | null = editor.storage.pageTree?.currentPageId ?? null;

    axios
      .get<PageItem[]>('/api/pages')
      .then((res) => {
        const children = res.data.filter((p) => p.parent_id === currentPageId);
        setChildPages(children);
      })
      .catch((err) => console.error('Failed to fetch pages:', err))
      .finally(() => setLoading(false));
  }, [editor]);

  const handleNavigate = (pageId: string) => {
    if (!editor) return;
    const navigate: ((id: string) => void) | null = editor.storage.pageTree?.onNavigate ?? null;
    if (navigate) {
      navigate(pageId);
    }
  };

  return (
    <NodeViewWrapper className="page-tree-node" contentEditable={false}>
      <div className="page-tree-node__title">Child Pages</div>
      {loading ? (
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0 }}>Loading...</p>
      ) : childPages.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0 }}>
          No child pages
        </p>
      ) : (
        <ul>
          {childPages.map((page) => (
            <li key={page.id}>
              <button
                className="page-tree-node__link"
                onClick={() => handleNavigate(page.id)}
              >
                {page.title || 'Untitled'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </NodeViewWrapper>
  );
}

export const PageTreeExtension = Node.create({
  name: 'pageTree',
  group: 'block',
  atom: true,

  addStorage() {
    return {
      currentPageId: null as string | null,
      onNavigate: null as ((id: string) => void) | null,
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="page-tree"]' }];
  },

  renderHTML() {
    return ['div', { 'data-type': 'page-tree' }, 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(PageTreeComponent);
  },

  addCommands() {
    return {
      insertPageTree:
        () =>
        ({ commands }) => {
          return commands.insertContent({ type: this.name });
        },
    };
  },
});
