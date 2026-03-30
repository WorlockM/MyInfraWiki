import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useEditor, EditorContent, Editor as TipTapEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Typography from '@tiptap/extension-typography';
import CharacterCount from '@tiptap/extension-character-count';
import Link from '@tiptap/extension-link';
import { CodeBlockWithCopy } from './CodeBlockView';
import { Callout } from './CalloutExtension';
import axios from 'axios';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code,
  Minus,
  Table as TableIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Highlighter,
  CheckSquare,
  Undo,
  Redo,
  Pencil,
  Save,
  Info,
  AlertTriangle,
  AlertCircle,
} from 'lucide-react';

interface EditorProps {
  pageId: string;
  onSaved: () => void;
  defaultEditing?: boolean;
}

interface PageData {
  id: string;
  title: string;
  content: string;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface ToolbarButtonProps {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
  disabled?: boolean;
}

function ToolbarButton({ onClick, active, title, children, disabled }: ToolbarButtonProps) {
  return (
    <button
      className={`toolbar-btn ${active ? 'toolbar-btn--active' : ''}`}
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
      type="button"
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: TipTapEditor }) {
  return (
    <div className="editor-toolbar">
      <div className="toolbar-group">
        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          title="Undo"
          disabled={!editor.can().undo()}
        >
          <Undo size={15} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          title="Redo"
          disabled={!editor.can().redo()}
        >
          <Redo size={15} />
        </ToolbarButton>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive('bold')}
          title="Bold (Cmd+B)"
        >
          <Bold size={15} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive('italic')}
          title="Italic (Cmd+I)"
        >
          <Italic size={15} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive('underline')}
          title="Underline (Cmd+U)"
        >
          <UnderlineIcon size={15} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHighlight().run()}
          active={editor.isActive('highlight')}
          title="Highlight"
        >
          <Highlighter size={15} />
        </ToolbarButton>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          active={editor.isActive('heading', { level: 1 })}
          title="Heading 1"
        >
          <Heading1 size={15} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive('heading', { level: 2 })}
          title="Heading 2"
        >
          <Heading2 size={15} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          active={editor.isActive('heading', { level: 3 })}
          title="Heading 3"
        >
          <Heading3 size={15} />
        </ToolbarButton>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive('bulletList')}
          title="Bullet List"
        >
          <List size={15} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive('orderedList')}
          title="Ordered List"
        >
          <ListOrdered size={15} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          active={editor.isActive('taskList')}
          title="Task List"
        >
          <CheckSquare size={15} />
        </ToolbarButton>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          active={editor.isActive('blockquote')}
          title="Blockquote"
        >
          <Quote size={15} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          active={editor.isActive('codeBlock')}
          title="Code Block"
        >
          <Code size={15} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="Horizontal Rule"
        >
          <Minus size={15} />
        </ToolbarButton>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          active={editor.isActive({ textAlign: 'left' })}
          title="Align Left"
        >
          <AlignLeft size={15} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          active={editor.isActive({ textAlign: 'center' })}
          title="Align Center"
        >
          <AlignCenter size={15} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          active={editor.isActive({ textAlign: 'right' })}
          title="Align Right"
        >
          <AlignRight size={15} />
        </ToolbarButton>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <ToolbarButton
          onClick={() =>
            editor
              .chain()
              .focus()
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run()
          }
          title="Insert Table"
        >
          <TableIcon size={15} />
        </ToolbarButton>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <ToolbarButton
          onClick={() => editor.chain().focus().insertCallout('info').run()}
          title="Info callout"
        >
          <Info size={15} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().insertCallout('warning').run()}
          title="Warning callout"
        >
          <AlertTriangle size={15} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().insertCallout('error').run()}
          title="Error callout"
        >
          <AlertCircle size={15} />
        </ToolbarButton>
      </div>
    </div>
  );
}

async function uploadImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await axios.post<{ url: string }>('/api/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data.url;
}

export default function Editor({ pageId, onSaved, defaultEditing = false }: EditorProps) {
  const [title, setTitle] = useState('');
  const [isEditing, setIsEditing] = useState(defaultEditing);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [loading, setLoading] = useState(true);
  const [wordCount, setWordCount] = useState(0);
  const titleRef = useRef(title);

  titleRef.current = title;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        horizontalRule: false,
      }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Highlight,
      TaskList,
      TaskItem.configure({ nested: true }),
      Image.configure({ inline: false, allowBase64: false }),
      Placeholder.configure({ placeholder: 'Start writing...' }),
      CodeBlockWithCopy,
      Callout,
      Link.configure({ openOnClick: true, autolink: true }),
      HorizontalRule,
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      Typography,
      CharacterCount,
    ],
    content: '',
    editable: defaultEditing,
    onUpdate: ({ editor }) => {
      setWordCount(editor.storage.characterCount?.words() ?? 0);
    },
    editorProps: {
      handleDrop: (view, event, _slice, moved) => {
        if (!moved && event.dataTransfer?.files.length) {
          const files = Array.from(event.dataTransfer.files).filter((f) =>
            f.type.startsWith('image/')
          );
          if (files.length) {
            event.preventDefault();
            files.forEach(async (file) => {
              try {
                const url = await uploadImage(file);
                const { schema } = view.state;
                const coordinates = view.posAtCoords({
                  left: event.clientX,
                  top: event.clientY,
                });
                const node = schema.nodes.image.create({ src: url });
                const transaction = view.state.tr.insert(coordinates?.pos ?? 0, node);
                view.dispatch(transaction);
              } catch (err) {
                console.error('Image upload failed:', err);
              }
            });
            return true;
          }
        }
        return false;
      },
      handlePaste: (_view, event) => {
        const items = Array.from(event.clipboardData?.items ?? []);
        const imageItems = items.filter((item) => item.type.startsWith('image/'));
        if (imageItems.length) {
          event.preventDefault();
          imageItems.forEach(async (item) => {
            const file = item.getAsFile();
            if (!file) return;
            try {
              const url = await uploadImage(file);
              editor?.chain().focus().setImage({ src: url }).run();
            } catch (err) {
              console.error('Image paste upload failed:', err);
            }
          });
          return true;
        }
        return false;
      },
    },
  });

  // Sync editable state with TipTap
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(isEditing);
    if (isEditing) {
      setTimeout(() => editor.commands.focus('end'), 0);
    }
  }, [editor, isEditing]);

  // Load page data
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    axios
      .get<PageData>(`/api/pages/${pageId}`)
      .then((res) => {
        if (cancelled) return;
        setTitle(res.data.title);
        editor?.commands.setContent(res.data.content || '');
        setWordCount(editor?.storage.characterCount?.words() ?? 0);
        setLoading(false);
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Failed to load page:', err);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [pageId, editor]);

  const save = useCallback(async () => {
    if (!editor) return;
    setSaveStatus('saving');
    try {
      await axios.put(`/api/pages/${pageId}`, {
        title: titleRef.current,
        content: editor.getHTML(),
      });
      setSaveStatus('saved');
      onSaved();
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      console.error('Failed to save page:', err);
      setSaveStatus('error');
    }
  }, [editor, pageId, onSaved]);

  const handleSave = useCallback(async () => {
    await save();
    setIsEditing(false);
  }, [save]);

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      editor?.commands.focus();
    }
  };

  // Cmd+S / Ctrl+S to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's' && isEditing) {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isEditing, handleSave]);

  if (loading) {
    return (
      <div className="editor-loading">
        <div className="editor-loading-spinner" />
      </div>
    );
  }

  return (
    <div className="editor-container">
      <div className="editor-header">
        {isEditing ? (
          <input
            className="editor-title-input"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={handleTitleKeyDown}
            placeholder="Untitled"
            aria-label="Page title"
          />
        ) : (
          <h1 className="editor-title-view">{title || 'Untitled'}</h1>
        )}

        <div className="editor-meta">
          {saveStatus === 'saving' && <span className="save-status save-status--saving">Saving...</span>}
          {saveStatus === 'saved' && <span className="save-status save-status--saved">Saved</span>}
          {saveStatus === 'error' && <span className="save-status save-status--error">Save failed</span>}
          <span className="word-count">{wordCount} words</span>

          {isEditing ? (
            <button className="btn-mode btn-mode--save" onClick={handleSave} title="Save (Cmd+S)">
              <Save size={14} />
              Save
            </button>
          ) : (
            <button className="btn-mode btn-mode--edit" onClick={handleEdit} title="Edit page">
              <Pencil size={14} />
              Edit
            </button>
          )}
        </div>
      </div>

      {isEditing && editor && <Toolbar editor={editor} />}

      <div className={`editor-content-area ${!isEditing ? 'editor-content-area--readonly' : ''}`}>
        <EditorContent editor={editor} className="tiptap-editor" />
      </div>
    </div>
  );
}
