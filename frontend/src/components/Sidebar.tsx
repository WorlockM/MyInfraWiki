import React, { useState } from 'react';
import { PageTreeNode } from '../App';
import {
  ChevronRight,
  ChevronDown,
  FileText,
  Plus,
  Trash2,
  FilePlus,
} from 'lucide-react';

interface SidebarProps {
  pages: PageTreeNode[];
  selectedPageId: string | null;
  onSelectPage: (id: string) => void;
  onNewPage: (parentId: string | null) => void;
  onDeletePage: (id: string) => void;
}

interface PageItemProps {
  node: PageTreeNode;
  depth: number;
  selectedPageId: string | null;
  onSelectPage: (id: string) => void;
  onNewPage: (parentId: string | null) => void;
  onDeletePage: (id: string) => void;
}

function PageItem({
  node,
  depth,
  selectedPageId,
  onSelectPage,
  onNewPage,
  onDeletePage,
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
    setExpanded((v) => !v);
  };

  return (
    <div className="page-tree-item">
      <div
        className={`page-row ${isSelected ? 'page-row--selected' : ''}`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={() => onSelectPage(node.id)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
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
        <div className="page-children">
          {node.children.map((child) => (
            <PageItem
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedPageId={selectedPageId}
              onSelectPage={onSelectPage}
              onNewPage={onNewPage}
              onDeletePage={onDeletePage}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Sidebar({
  pages,
  selectedPageId,
  onSelectPage,
  onNewPage,
  onDeletePage,
}: SidebarProps) {
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
          pages.map((node) => (
            <PageItem
              key={node.id}
              node={node}
              depth={0}
              selectedPageId={selectedPageId}
              onSelectPage={onSelectPage}
              onNewPage={onNewPage}
              onDeletePage={onDeletePage}
            />
          ))
        )}
      </nav>
    </div>
  );
}
