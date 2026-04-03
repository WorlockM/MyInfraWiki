import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import Sidebar from './components/Sidebar';
import Editor from './components/Editor';
import SearchModal from './components/SearchModal';
import { Moon, Sun, Search, Menu } from 'lucide-react';

export interface PageTreeNode {
  id: string;
  title: string;
  parent_id: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  children: PageTreeNode[];
}

export interface PageData {
  id: string;
  title: string;
  content: string;
  parent_id: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

function buildTree(pages: Omit<PageTreeNode, 'children'>[]): PageTreeNode[] {
  const map = new Map<string, PageTreeNode>();
  const roots: PageTreeNode[] = [];

  for (const page of pages) {
    map.set(page.id, { ...page, children: [] });
  }

  for (const page of pages) {
    const node = map.get(page.id)!;
    if (page.parent_id && map.has(page.parent_id)) {
      map.get(page.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort children by position
  const sortChildren = (nodes: PageTreeNode[]) => {
    nodes.sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
    nodes.forEach((n) => sortChildren(n.children));
  };
  sortChildren(roots);

  return roots;
}

export default function App() {
  const [pages, setPages] = useState<PageTreeNode[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [newPageId, setNewPageId] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('darkMode') === 'true';
  });
  const [searchOpen, setSearchOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const editorDirtyCheckRef = useRef<() => boolean>(() => false);

  // Apply dark mode
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    localStorage.setItem('darkMode', String(darkMode));
  }, [darkMode]);

  // Keyboard shortcut for search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const fetchPages = useCallback(async () => {
    try {
      const res = await axios.get<Omit<PageTreeNode, 'children'>[]>('/api/pages');
      setPages(buildTree(res.data));
    } catch (err) {
      console.error('Failed to fetch pages:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPages();
  }, [fetchPages]);

  const confirmIfDirty = useCallback((): boolean => {
    if (editorDirtyCheckRef.current()) {
      return window.confirm('You have unsaved changes. Are you sure you want to leave?');
    }
    return true;
  }, []);

  const handleSelectPage = useCallback(
    (id: string) => {
      if (!confirmIfDirty()) return;
      setSelectedPageId(id);
      setNewPageId(null);
      setSidebarOpen(false);
    },
    [confirmIfDirty]
  );

  const handleNewPage = async (parentId: string | null = null) => {
    if (!confirmIfDirty()) return;
    try {
      const res = await axios.post<PageData>('/api/pages', {
        title: 'Untitled',
        content: '',
        parent_id: parentId,
      });
      await fetchPages();
      setNewPageId(res.data.id);
      setSelectedPageId(res.data.id);
    } catch (err) {
      console.error('Failed to create page:', err);
    }
  };

  const handleDeletePage = async (id: string) => {
    try {
      await axios.delete(`/api/pages/${id}`);
      if (selectedPageId === id) {
        setSelectedPageId(null);
      }
      await fetchPages();
    } catch (err) {
      console.error('Failed to delete page:', err);
    }
  };

  const handleReparentPage = useCallback(async (pageId: string, newParentId: string | null) => {
    try {
      await axios.put(`/api/pages/${pageId}`, { parent_id: newParentId });
      await fetchPages();
    } catch (err) {
      console.error('Failed to reparent page:', err);
    }
  }, [fetchPages]);

  const handleReorderPages = useCallback(async (parentId: string | null, orderedIds: string[]) => {
    try {
      await Promise.all(
        orderedIds.map((id, index) => axios.put(`/api/pages/${id}`, { position: index }))
      );
      await fetchPages();
    } catch (err) {
      console.error('Failed to reorder pages:', err);
    }
  }, [fetchPages]);

  const handlePageSaved = useCallback(() => {
    fetchPages();
  }, [fetchPages]);

  return (
    <div className="app-container">
      {/* Overlay for mobile sidebar */}
      <div
        className={`sidebar-overlay${sidebarOpen ? ' sidebar-overlay--visible' : ''}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      <aside className={`sidebar${sidebarOpen ? ' sidebar--open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <img src="/logo-icon.png" alt="" className="sidebar-logo__icon" />
            <span className="sidebar-logo__text">MyInfraWiki</span>
          </div>
          <div className="sidebar-header-actions">
            <button
              className="icon-btn"
              onClick={() => setSearchOpen(true)}
              title="Search (Cmd+K)"
              aria-label="Open search"
            >
              <Search size={16} />
            </button>
            <button
              className="icon-btn"
              onClick={() => setDarkMode((d) => !d)}
              title="Toggle dark mode"
              aria-label="Toggle dark mode"
            >
              {darkMode ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="sidebar-loading">Loading...</div>
        ) : (
          <Sidebar
            pages={pages}
            selectedPageId={selectedPageId}
            onSelectPage={handleSelectPage}
            onNewPage={handleNewPage}
            onDeletePage={handleDeletePage}
            onReorderPages={handleReorderPages}
            onReparentPage={handleReparentPage}
          />
        )}
        <div className="sidebar-version">{__APP_VERSION__}</div>
      </aside>

      <main className="main-content">
        {/* Mobile-only header with hamburger */}
        <div className="mobile-header">
          <button
            className="hamburger-btn icon-btn"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open sidebar"
          >
            <Menu size={20} />
          </button>
          <span className="sidebar-logo__text">MyInfraWiki</span>
        </div>

        {selectedPageId ? (
          <Editor
            key={selectedPageId}
            pageId={selectedPageId}
            onSaved={handlePageSaved}
            defaultEditing={selectedPageId === newPageId}
            onNavigate={handleSelectPage}
            onRegisterDirtyCheck={(fn) => { editorDirtyCheckRef.current = fn; }}
          />
        ) : (
          <div className="empty-state">
            <div className="empty-state-inner">
              {pages.length === 0 ? (
                <>
                  <h2>Welcome to MyInfraWiki</h2>
                  <p>Get started by creating your first page.</p>
                  <button className="btn-primary" onClick={() => handleNewPage(null)}>
                    Create your first page
                  </button>
                </>
              ) : (
                <>
                  <img src="/logo-icon.png" alt="MyInfraWiki" style={{ width: 80, marginBottom: 16 }} />
                  <h2>MyInfraWiki</h2>
                  <p>Select a page from the sidebar or create a new one to get started.</p>
                </>
              )}
            </div>
          </div>
        )}
      </main>

      {searchOpen && (
        <SearchModal
          onClose={() => setSearchOpen(false)}
          onSelectPage={(id) => {
            handleSelectPage(id);
            setSearchOpen(false);
          }}
        />
      )}
    </div>
  );
}
