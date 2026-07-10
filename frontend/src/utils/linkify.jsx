import React from 'react';

// Matches markdown-style [label](url) links, or bare http(s) URLs.
const LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<]+)/g;
const TRAILING_PUNCT_RE = /[.,;:!?)'"]+$/;

// Renders a plain-text string as React nodes, turning URLs (and markdown
// [label](url) links) into clickable anchors. No HTML is ever parsed/injected.
export function linkify(text) {
  if (!text) return text;
  const nodes = [];
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = LINK_RE.exec(text)) !== null) {
    const [full, mdLabel, mdUrl, bareUrl] = match;
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));

    if (mdUrl) {
      nodes.push(
        <a key={key++} href={mdUrl} target="_blank" rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-indigo-600 underline hover:text-indigo-700">
          {mdLabel}
        </a>
      );
    } else {
      let url = bareUrl;
      let trailing = '';
      const trailingMatch = url.match(TRAILING_PUNCT_RE);
      if (trailingMatch) {
        trailing = trailingMatch[0];
        url = url.slice(0, -trailing.length);
      }
      nodes.push(
        <a key={key++} href={url} target="_blank" rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-indigo-600 underline hover:text-indigo-700 break-all">
          {url}
        </a>
      );
      if (trailing) nodes.push(trailing);
    }

    lastIndex = match.index + full.length;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}
