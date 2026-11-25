// Sources as the citation drawer shows them: the passages an answer cited, each
// linked to its library article when there is one. Shared by every path that
// produces an answer.
import { matchSourceToArticle } from './kbToLibrary.js';

export function mapSourcesToCitations(sources) {
  return (sources || []).map((s) => {
    const match = matchSourceToArticle(s);
    return {
      title: s.title,
      org: s.org,
      url: s.url,
      excerpt: s.excerpt,
      num: s.num,
      ...(match ? { articleId: match.id, cat: match.cat } : {}),
    };
  });
}
