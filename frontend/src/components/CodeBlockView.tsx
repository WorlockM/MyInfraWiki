import React, { useRef, useState } from 'react';
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import { createLowlight } from 'lowlight';
import { Check, Copy } from 'lucide-react';

const lowlight = createLowlight();

function CodeBlockComponent({ node }: { node: { attrs: { language?: string } } }) {
  const [copied, setCopied] = useState(false);
  const codeRef = useRef<HTMLElement>(null);

  const handleCopy = () => {
    const text = codeRef.current?.innerText ?? '';
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <NodeViewWrapper className="code-block-wrapper">
      <button
        className={`code-copy-btn ${copied ? 'code-copy-btn--copied' : ''}`}
        onClick={handleCopy}
        contentEditable={false}
        title="Copy code"
        aria-label="Copy code"
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
        {copied ? 'Copied!' : 'Copy'}
      </button>
      {node.attrs.language && (
        <span className="code-block-lang" contentEditable={false}>
          {node.attrs.language}
        </span>
      )}
      <pre>
        <NodeViewContent as="code" ref={codeRef} />
      </pre>
    </NodeViewWrapper>
  );
}

export const CodeBlockWithCopy = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockComponent);
  },
}).configure({ lowlight });
