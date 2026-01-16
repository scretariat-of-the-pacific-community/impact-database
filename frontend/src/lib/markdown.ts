/**
 * Simple markdown-to-HTML converter for UI text
 * Converts common markdown patterns to HTML for proper rendering
 */

export function renderMarkdown(text: string): string {
  if (!text) return '';

  return (
    text
      // Bold: **text** or __text__
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(.+?)__/g, '<strong>$1</strong>')
      // Italic: *text* or _text_ (but not in URLs or already processed)
      .replace(/(?<!\w)\*([^*]+?)\*(?!\w)/g, '<em>$1</em>')
      .replace(/(?<!\w)_([^_]+?)_(?!\w)/g, '<em>$1</em>')
      // Code: `text`
      .replace(/`(.+?)`/g, '<code>$1</code>')
      // Links: [text](url)
      .replace(
        /\[(.+?)\]\((.+?)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
      )
      // Paragraphs: double line breaks
      .replace(/\n\n/g, '<br><br>')
      // Single line breaks
      .replace(/\n/g, '<br>')
  );
}

/**
 * Strip markdown formatting for plain text (e.g., for metadata)
 */
export function stripMarkdown(text: string): string {
  if (!text) return '';

  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .trim();
}
