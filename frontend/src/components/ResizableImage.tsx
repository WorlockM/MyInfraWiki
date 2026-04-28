import React, { useRef, useCallback } from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewProps } from '@tiptap/react';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    image: {
      setImage: (options: { src: string; alt?: string; title?: string }) => ReturnType;
    };
  }
}

function ResizableImageComponent({ node, updateAttributes, selected, editor }: NodeViewProps) {
  const { src, alt, title, width } = node.attrs as {
    src: string;
    alt?: string;
    title?: string;
    width?: number | null;
  };
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isResizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const isEditable = editor.isEditable;

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!isEditable) return;
    e.preventDefault();
    e.stopPropagation();
    isResizing.current = true;
    startX.current = e.clientX;
    startWidth.current = imgRef.current?.offsetWidth ?? 300;

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isResizing.current) return;
      const delta = ev.clientX - startX.current;
      const newWidth = Math.max(50, startWidth.current + delta);
      updateAttributes({ width: newWidth });
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [isEditable, updateAttributes]);

  const setPresetWidth = useCallback((pct: number | null) => {
    if (pct === null) {
      updateAttributes({ width: null });
      return;
    }
    const containerWidth = containerRef.current?.closest('.ProseMirror')?.clientWidth ?? 800;
    updateAttributes({ width: Math.round(containerWidth * pct / 100) });
  }, [updateAttributes]);

  return (
    <NodeViewWrapper as="span" style={{ display: 'inline-block', verticalAlign: 'bottom', margin: '0.25em' }}>
      <div
        ref={containerRef}
        className={`resizable-image-container${selected && isEditable ? ' resizable-image--selected' : ''}`}
        style={{ width: width ? `${width}px` : undefined, maxWidth: '100%', position: 'relative', display: 'inline-block' }}
      >
        <img
          ref={imgRef}
          src={src}
          alt={alt ?? ''}
          title={title ?? undefined}
          style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 'var(--radius)' }}
          draggable={false}
        />
        {selected && isEditable && (
          <>
            <div className="resize-handle" onMouseDown={handleMouseDown} title="Sleep om te resizen" />
            <div className="resize-toolbar">
              <button type="button" onClick={() => setPresetWidth(25)} title="25% breedte">25%</button>
              <button type="button" onClick={() => setPresetWidth(50)} title="50% breedte">50%</button>
              <button type="button" onClick={() => setPresetWidth(75)} title="75% breedte">75%</button>
              <button type="button" onClick={() => setPresetWidth(null)} title="Volledige breedte">100%</button>
            </div>
          </>
        )}
      </div>
    </NodeViewWrapper>
  );
}

export const ResizableImage = Node.create({
  name: 'image',
  group: 'inline',
  inline: true,
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
      title: { default: null },
      width: {
        default: null,
        parseHTML: (el) => {
          const img = el as HTMLImageElement;
          const w = img.getAttribute('width') ?? img.style.width;
          if (!w) return null;
          const parsed = parseInt(w);
          return isNaN(parsed) ? null : parsed;
        },
        renderHTML: (attrs) => {
          if (!attrs.width) return {};
          return { width: String(attrs.width) };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'img[src]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageComponent);
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addCommands(): any {
    return {
      setImage:
        (options: Record<string, unknown>) =>
        ({ commands }: { commands: { insertContent: (content: unknown) => boolean } }) => {
          return commands.insertContent({ type: this.name, attrs: options });
        },
    };
  },
});
