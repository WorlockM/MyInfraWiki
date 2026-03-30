import React, { useState, useRef, useEffect } from 'react';
import { PageTreeNode } from '../App';
import {
  ChevronRight,
  ChevronDown,
  FileText,
  Plus,
  Trash2,
  FilePlus,
  GripVertical,
} from 'lucide-react';

interface SidebarProps {
  pages: PageTreeNode[];
  selectedPageId: string | null;
  onSelectPage: (id: string) => void;
  onNewPage: (parentId: string | null) => void;
  onDeletePage: (id: string) => void;
  onReorderPages: (parentId: string | null, orderedIds: string[]) => void;
}

interface PageItemProps {
  node: PageTreeNode;
  depth: number;
  selectedPageId: string | null;
  onSelectPage: (id: string) => void;
  onNewPage: (parentId: string | null) => void;
  onDeletePage: (id: string) => void;
  onReorderPages: (parentId: string | null, orderedIds: string[]) => void;
  dragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}

interface PageListProps {
  nodes: PageTreeNode[];
  parentId: string | null;
  depth: number;
  selectedPageId: string | null;
  onSelectPage: (id: string) => void;
  onNewPage: (parentId: string | null) => void;
  onDeletePage: (id: string) => void;
  onReorderPages: (parentId: string | null, orderedIds: string[]) => void;
}

function PageList({ nodes, parentId, depth, selectedPageId, onSelectPage, onNewPage, onDeletePage, onReorderPages }: PageListProps) {
  const draggedIdRef = useRef<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropInfo, setDropInfo] = useState<{ id: string; before: boolean } | null>(null);

  const reset = () => {
    draggedIdRef.current = null;
    setDraggingId(null);
    setDropInfo(null);
  };

  const resetRef = useRef(reset);
  resetRef.current = reset;

  useEffect(() => {
    const handler = () => resetRef.current();
    document.addEventListener('dragend', handler);
    return () => document.removeEventListener('dragend', handler);
  }, []);

  const handleDragStart = (id: string) => (e: React.DragEvent) => {
    draggedIdRef.current = id;
    setDraggingId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (id: string) => (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggedIdRef.current === id) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    setDropInfo(prev => (prev?.id === id && prev.before === before ? prev : { id, before }));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const draggedId = draggedIdRef.current;
    if (!draggedId || !dropInfo || draggedId === dropInfo.id) { reset(); return; }

    const newOrder = nodes.map(n => n.id).filter(id => id !== draggedId);
    const targetIdx = newOrder.indexOf(dropInfo.id);
    if (targetIdx === -1) { reset(); return; }
    newOrder.splice(dropInfo.before ? targetIdx : targetIdx + 1, 0, draggedId);

    onReorderPages(parentId, newOrder);
    reset();
  };

  return (
    <>
      {nodes.map(node => (
        <React.Fragment key={node.id}>
          {dropInfo?.id === node.id && dropInfo.before && (
            <div className="drop-indicator" style={{ marginLeft: `${8 + depth * 16}px` }} />
          )}
          <PageItem
            node={node}
            depth={depth}
            selectedPageId={selectedPageId}
            onSelectPage={onSelectPage}
            onNewPage={onNewPage}
            onDeletePage={onDeletePage}
            onReorderPages={onReorderPages}
            dragging={draggingId === node.id}
            onDragStart={handleDragStart(node.id)}
            onDragEnd={reset}
            onDragOver={handleDragOver(node.id)}
            onDrop={handleDrop}
          />
          {dropInfo?.id === node.id && !dropInfo.before && (
            <div className="drop-indicator" style={{ marginLeft: `${8 + depth * 16}px` }} />
          )}
        </React.Fragment>
      ))}
    </>
  );
}

function PageItem({
  node, depth, selectedPageId, onSelectPage, onNewPage, onDeletePage, onReorderPages,
  dragging, onDragStart, onDragEnd, onDragOver, onDrop,
}: PageItemProps) {
  const [expanded, setExpanded] = useState(true);
  const [hovered, setHovered] = useState(false);
  const hasChildren = node.children.length > 0;
  const isSelected = node.id === selectedPageId;

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Delete "${node.title}" and all its sub-pages?`)) {
      onDeletePage(node.id);
    }
  };

  const handleAddChild = (e: React.MouseEvent) => {
    e.stopPropagation();
    onNewPage(node.id);
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(v => !v);
  };

  return (
    <div className={`page-tree-item${dragging ? ' page-tree-item--dragging' : ''}`}>
      <div
        className={`page-row${isSelected ? ' page-row--selected' : ''}`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={() => onSelectPage(node.id)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <span
          className="page-row__drag-handle"
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          title="Drag to reorder"
        >
          <GripVertical size={13} />
        </span>

        <button
          className="page-row__chevron"
          onClick={handleToggle}
          aria-label={expanded ? 'Collapse' : 'Expand'}
          style={{ visibility: hasChildren ? 'visible' : 'hidden' }}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        <FileText size={14} className="page-row__icon" />

        <span className="page-row__title">{node.title || 'Untitled'}</span>

        {hovered && (
          <div className="page-row__actions">
            <button
              className="page-row__action-btn"
              onClick={handleAddChild}
              title="Add sub-page"
              aria-label="Add sub-page"
            >
              <FilePlus size={13} />
            </button>
            <button
              className="page-row__action-btn page-row__action-btn--danger"
              onClick={handleDelete}
              title="Delete page"
              aria-label="Delete page"
            >
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>

      {hasChildren && expanded && (
        <PageList
          nodes={node.children}
          parentId={node.id}
          depth={depth + 1}
          selectedPageId={selectedPageId}
          onSelectPage={onSelectPage}
          onNewPage={onNewPage}
          onDeletePage={onDeletePage}
          onReorderPages={onReorderPages}
        />
      )}
    </div>
  );
}

export default function Sidebar({ pages, selectedPageId, onSelectPage, onNewPage, onDeletePage, onReorderPages }: SidebarProps) {
  return (
    <div className="sidebar-content">
      <div className="sidebar-new-page">
        <button className="btn-new-page" onClick={() => onNewPage(null)}>
          <Plus size={15} />
          <span>New Page</span>
        </button>
      </div>

      <nav className="page-tree" aria-label="Page tree">
        {pages.length === 0 ? (
          <div className="page-tree-empty">No pages yet</div>
        ) : (
          <PageList
            nodes={pages}
            parentId={null}
            depth={0}
            selectedPageId={selectedPageId}
            onSelectPage={onSelectPage}
            onNewPage={onNewPage}
            onDeletePage={onDeletePage}
            onReorderPages={onReorderPages}
          />
        )}
      </nav>
    </div>
  );
}
