import { Mark, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    wikiLink: {
      setWikiLink: (attrs: { pageId: string; pageTitle: string }) => ReturnType
    }
  }
}

export const WikiLinkExtension = Mark.create({
  name: 'wikiLink',

  addAttributes() {
    return {
      pageId: {
        default: null,
        parseHTML: element => element.getAttribute('data-page-id'),
        renderHTML: attributes => ({
          'data-page-id': attributes.pageId,
        }),
      },
      pageTitle: {
        default: null,
        parseHTML: element => element.getAttribute('data-page-title'),
        renderHTML: attributes => ({
          'data-page-title': attributes.pageTitle,
        }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-page-id]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, { class: 'wiki-link' }),
      0,
    ]
  },

  addCommands() {
    return {
      setWikiLink:
        (attrs) =>
        ({ commands }) => {
          return commands.setMark(this.name, attrs)
        },
    }
  },
})
