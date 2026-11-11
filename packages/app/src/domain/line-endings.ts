/**
 * Names the line break a text uses, so editors can keep it instead of rewriting every line. A text
 * with any CRLF counts as CRLF; anything else, including a single line, counts as LF.
 *
 * @param content - The text to inspect.
 * @returns "\r\n" or "\n".
 */
export function lineSeparatorOf(content: string): "\r\n" | "\n" {
  return content.includes("\r\n") ? "\r\n" : "\n";
}
