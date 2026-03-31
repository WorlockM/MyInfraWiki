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
  ArrowUpAZ,
} from 'lucide-react';

function sortAlphabetically(nodes: PageTreeNode[]): PageTreeNode[] {
  return [...nodes]
    .sort((a, b) => (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' }))
    .map(n => ({ ...n, children: sortAlphabetically(n.children) }));
}

interface SidebarProps {
  pages: PageTreeNode[];
  selectedPageId: string | null;
  onSelectPage: (id: string) => void;
  onNewPage: (parentId: string | null) => void;
  onDeletePage: (id: string) => void;
  onReorderPages: (parentId: string | null, orderedIds: string[]) => void;
  onReparentPage: (pageId: string, newParentId: string | null) => void;
}

interface PageItemProps {
  node: PageTreeNode;
  depth: number;
  selectedPageId: string | null;
  onSelectPage: (id: string) => void;
  onNewPage: (parentId: string | null) => void;
  onDeletePage: (id: string) => void;
  onReorderPages: (parentId: string | null, orderedIds: string[]) => void;
  onReparentPage: (pageId: string, newParentId: string | null) => void;
  isDescendant: (ancestorId: string, targetId: string) => boolean;
  sortable: boolean;
  dragging: boolean;
  dropPosition: DropPosition | null;
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
  onReparentPage: (pageId: string, newParentId: string | null) => void;
  isDescendant: (ancestorId: string, targetId: string) => boolean;
  sortable: boolean;
}

function collectDescendantIds(node: PageTreeNode): string[] {
  const ids: string[] = [];
  for (const child of node.children) {
    ids.push(child.id);
    ids.push(...collectDescendantIds(child));
  }
  return ids;
}

function buildDescendantMap(pages: PageTreeNode[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const visit = (node: PageTreeNode) => {
    map.set(node.id, collectDescendantIds(node));
    node.children.forEach(visit);
  };
  pages.forEach(visit);
  return map;
}

type DropPosition = 'before' | 'after' | 'inside';
type DropInfo = { id: string; position: DropPosition };

function PageList({ nodes, parentId, depth, selectedPageId, onSelectPage, onNewPage, onDeletePage, onReorderPages, onReparentPage, isDescendant, sortable }: PageListProps) {
  const draggedIdRef = useRef<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropInfo, setDropInfo] = useState<DropInfo | null>(null);

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
    if (draggedIdRef.current && draggedIdRef.current === id) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const ratio = (e.clientY - rect.top) / rect.height;
    // Top 33% = before, middle 33% = after, bottom 33% = inside (nest as child)
    const position: DropPosition = ratio < 0.33 ? 'before' : ratio > 0.67 ? 'inside' : 'after';
    setDropInfo(prev => (prev?.id === id && prev.position === position ? prev : { id, position }));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const draggedId = draggedIdRef.current || e.dataTransfer.getData('text/plain');
    if (!draggedId || !dropInfo || draggedId === dropInfo.id) { reset(); return; }

    // Guard: never drop a page onto itself or one of its own descendants
    if (isDescendant(draggedId, dropInfo.id) || draggedId === dropInfo.id) { reset(); return; }

    if (dropInfo.position === 'inside') {
      onReparentPage(draggedId, dropInfo.id);
    } else {
      const isInThisList = nodes.some(n => n.id === draggedId);
      if (isInThisList) {
        const newOrder = nodes.map(n => n.id).filter(id => id !== draggedId);
        const targetIdx = newOrder.indexOf(dropInfo.id);
        if (targetIdx === -1) { reset(); return; }
        newOrder.splice(dropInfo.position === 'before' ? targetIdx : targetIdx + 1, 0, draggedId);
        onReorderPages(parentId, newOrder);
      } else {
        // Dragged from a different level — reparent to this list's level
        onReparentPage(draggedId, parentId);
      }
    }
    reset();
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDropInfo(null);
    }
  };

  return (
    <div onDragLeave={handleDragLeave}>
      {nodes.map(node => (
        <React.Fragment key={node.id}>
          {dropInfo?.id === node.id && dropInfo.position === 'before' && (
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
            onReparentPage={onReparentPage}
            isDescendant={isDescendant}
            sortable={sortable}
            dragging={draggingId === node.id}
            dropPosition={dropInfo?.id === node.id ? dropInfo.position : null}
            onDragStart={handleDragStart(node.id)}
            onDragEnd={reset}
            onDragOver={handleDragOver(node.id)}
            onDrop={handleDrop}
          />
        </React.Fragment>
      ))}
    </div>
  );
}

function PageItem({
  node, depth, selectedPageId, onSelectPage, onNewPage, onDeletePage, onReorderPages, onReparentPage,
  isDescendant, sortable, dragging, dropPosition, onDragStart, onDragEnd, onDragOver, onDrop,
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
        onPointerEnter={(e) => { if (e.pointerType !== 'touch') setHovered(true); }}
        onPointerLeave={(e) => { if (e.pointerType !== 'touch') setHovered(false); }}
        onDragOver={sortable ? onDragOver : undefined}
        onDrop={sortable ? onDrop : undefined}
      >
        {sortable && <span
          className="page-row__drag-handle"
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          title="Drag to reorder"
        >
          <GripVertical size={13} />
        </span>}

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

      {/* Drop indicators rendered directly after the row, not after children */}
      {sortable && dropPosition === 'after' && (
        <div className="drop-indicator" style={{ marginLeft: `${8 + depth * 16}px` }} />
      )}
      {sortable && dropPosition === 'inside' && (
        <div className="drop-indicator" style={{ marginLeft: `${8 + (depth + 1) * 16}px` }} />
      )}

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
          onReparentPage={onReparentPage}
          isDescendant={isDescendant}
          sortable={sortable}
        />
      )}
    </div>
  );
}

export default function Sidebar({ pages, selectedPageId, onSelectPage, onNewPage, onDeletePage, onReorderPages, onReparentPage }: SidebarProps) {
  const [sortAlpha, setSortAlpha] = useState<boolean>(() => localStorage.getItem('sortAlpha') === 'true');

  const toggleSort = () => {
    setSortAlpha(prev => {
      const next = !prev;
      localStorage.setItem('sortAlpha', String(next));
      return next;
    });
  };

  const displayedPages = sortAlpha ? sortAlphabetically(pages) : pages;
  const descendantMap = buildDescendantMap(pages);

  const isDescendant = (ancestorId: string, targetId: string): boolean => {
    return descendantMap.get(ancestorId)?.includes(targetId) ?? false;
  };

  return (
    <div className="sidebar-content">
      <div className="sidebar-new-page">
        <button className="btn-new-page" onClick={() => onNewPage(null)}>
          <Plus size={15} />
          <span>New Page</span>
        </button>
        <button
          className={`btn-icon${sortAlpha ? ' btn-icon--active' : ''}`}
          onClick={toggleSort}
          title={sortAlpha ? 'Alphabetical order (click to switch to manual)' : 'Manual order (click to sort alphabetically)'}
          aria-label="Toggle alphabetical sort"
        >
          <ArrowUpAZ size={15} />
        </button>
      </div>

      <nav className="page-tree" aria-label="Page tree">
        {displayedPages.length === 0 ? (
          <div className="page-tree-empty">No pages yet</div>
        ) : (
          <PageList
            nodes={displayedPages}
            parentId={null}
            depth={0}
            selectedPageId={selectedPageId}
            onSelectPage={onSelectPage}
            onNewPage={onNewPage}
            onDeletePage={onDeletePage}
            onReorderPages={onReorderPages}
            onReparentPage={onReparentPage}
            isDescendant={isDescendant}
            sortable={!sortAlpha}
          />
        )}
      </nav>
    </div>
  );
}
