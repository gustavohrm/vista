import type { ChangeEvent } from "react";

interface RawEditorProps {
  /** Text content of the file. */
  content: string;
  /** Callback fired whenever the text content changes. */
  onChange: (value: string) => void;
  /** File name or path for accessibility. */
  fileName: string;
}

/**
 * Plain-text raw editor component for all file types. It is a full-pane document surface like the
 * Markdown editor, not a form field, so it deliberately doesn't use the design system's `.textarea`
 * control: that class adds a field radius and a focus ring framing the whole pane.
 *
 * @param props - RawEditor properties.
 * @returns Raw editor element.
 */
export function RawEditor({ content, onChange, fileName }: RawEditorProps) {
  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  };

  return (
    <div className="bg-background flex h-full w-full flex-col p-4">
      <textarea
        aria-label={`Raw text content of ${fileName}`}
        value={content}
        onChange={handleChange}
        spellCheck={false}
        className="text-text placeholder:text-text-secondary h-full w-full resize-none border-none bg-transparent font-mono text-sm leading-relaxed outline-none"
        placeholder="Type here..."
      />
    </div>
  );
}
