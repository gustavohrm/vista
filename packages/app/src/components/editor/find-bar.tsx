import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import type { FindQuery } from "../../domain/find";
import { Tooltip } from "../feedback/tooltip";
import { NO_FIND_RESULT, type FindResult, type FindTarget } from "./find-target";

/** Which rows the find bar shows when it opens. */
export type FindMode = "find" | "replace";

interface FindBarProps {
  /** Returns the view being searched, read when searching so it follows view and tab changes. */
  getTarget: () => FindTarget | null;
  /** Changes when the searched view changes, such as on a tab switch, so the query runs again there. */
  targetKey: string;
  /** The document's text; matches are counted again when it changes. */
  content: string;
  /** Whether the view can replace text. Rendered views only find. */
  canReplace: boolean;
  mode: FindMode;
  /** Changes each time find is requested again, to move focus back to the find field. */
  focusRequest: number;
  onClose: () => void;
}

const EMPTY_QUERY: FindQuery = { text: "", caseSensitive: false, wholeWord: false, regexp: false };

/**
 * Find and replace bar floating over the editor. It searches through a `FindTarget`, so the same bar
 * serves the raw editor, where CodeMirror finds and replaces, and rendered views, which only find.
 * Enter and Shift+Enter move between matches, and Escape closes the bar.
 *
 * @param props - FindBar properties.
 * @returns Find bar element.
 */
export function FindBar({ getTarget, targetKey, content, canReplace, mode, focusRequest, onClose }: FindBarProps) {
  const [query, setQuery] = useState(EMPTY_QUERY);
  const [replacement, setReplacement] = useState("");
  const [isReplaceShown, setIsReplaceShown] = useState(mode === "replace");
  const [result, setResult] = useState<FindResult>(NO_FIND_RESULT);
  const findInputRef = useRef<HTMLInputElement>(null);
  const targetRef = useRef<FindTarget | null>(null);
  const getTargetRef = useRef(getTarget);
  getTargetRef.current = getTarget;

  useEffect(() => {
    setIsReplaceShown(mode === "replace");
    findInputRef.current?.focus();
    findInputRef.current?.select();
  }, [mode, focusRequest]);

  useEffect(() => {
    const target = getTargetRef.current();
    if (targetRef.current !== target) {
      targetRef.current?.clear();
      targetRef.current = target;
    }
    setResult(target?.search(query) ?? NO_FIND_RESULT);
  }, [query, targetKey]);

  useEffect(() => {
    setResult(targetRef.current?.refresh() ?? NO_FIND_RESULT);
  }, [content]);

  useEffect(() => () => targetRef.current?.clear(), []);

  const run = (action: (target: FindTarget) => FindResult) => {
    const target = targetRef.current;
    if (target) {
      setResult(action(target));
    }
  };

  const close = () => {
    targetRef.current?.clear();
    targetRef.current?.focus();
    onClose();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };

  const handleFindKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      run((target) => (event.shiftKey ? target.findPrevious() : target.findNext()));
    }
  };

  const handleReplaceKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      run((target) => target.replace(replacement));
    }
  };

  const toggle = (option: "caseSensitive" | "wholeWord" | "regexp") =>
    setQuery((previous) => ({ ...previous, [option]: !previous[option] }));
  const hasMatches = result.total > 0;
  const showsReplace = canReplace && isReplaceShown;

  return (
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- Escape anywhere in the bar closes it; the controls inside are the interactive elements
    <search
      aria-label="Find in file"
      onKeyDown={handleKeyDown}
      className="card soft floating absolute top-2 right-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-col gap-1 p-1 [--ui-radius-surface:8px]"
    >
      <div className="flex items-center gap-0.5">
        <div className={FIELD_CLASS}>
          <input
            ref={findInputRef}
            type="text"
            aria-label="Find"
            aria-invalid={result.invalid || undefined}
            placeholder="Find"
            value={query.text}
            onChange={(event) => setQuery((previous) => ({ ...previous, text: event.target.value }))}
            onKeyDown={handleFindKeyDown}
            className="ipt min-w-0 flex-1 text-[13px]"
          />
          <output className="text-text-secondary flex-none px-1 text-xs whitespace-nowrap tabular-nums">
            {describeResult(query, result)}
          </output>
          <BarButton
            label="Match case"
            icon={<i className="ic-case-sensitive" aria-hidden="true" />}
            pressed={query.caseSensitive}
            onClick={() => toggle("caseSensitive")}
            isInField
          />
          <BarButton
            label="Match whole word"
            icon={<i className="ic-whole-word" aria-hidden="true" />}
            pressed={query.wholeWord}
            onClick={() => toggle("wholeWord")}
            isInField
          />
          <BarButton
            label="Use regular expression"
            icon={<i className="ic-regex" aria-hidden="true" />}
            pressed={query.regexp}
            onClick={() => toggle("regexp")}
            isInField
          />
        </div>
        <BarButton
          label="Previous match (Shift+Enter)"
          icon={<i className="ic-arrow-up" aria-hidden="true" />}
          disabled={!hasMatches}
          onClick={() => run((target) => target.findPrevious())}
        />
        <BarButton
          label="Next match (Enter)"
          icon={<i className="ic-arrow-down" aria-hidden="true" />}
          disabled={!hasMatches}
          onClick={() => run((target) => target.findNext())}
        />
        {canReplace && (
          <BarButton
            label={isReplaceShown ? "Hide replace" : "Show replace"}
            icon={<i className="ic-replace" aria-hidden="true" />}
            onClick={() => setIsReplaceShown((shown) => !shown)}
            expanded={isReplaceShown}
          />
        )}
        <BarButton label="Close (Escape)" icon={<i className="ic-x" aria-hidden="true" />} onClick={close} />
      </div>
      {showsReplace && (
        <div className="flex items-center gap-0.5">
          <div className={FIELD_CLASS}>
            <input
              type="text"
              aria-label="Replace"
              placeholder="Replace"
              value={replacement}
              onChange={(event) => setReplacement(event.target.value)}
              onKeyDown={handleReplaceKeyDown}
              className="ipt min-w-0 flex-1 text-[13px]"
            />
          </div>
          <button
            type="button"
            aria-label="Replace (Enter)"
            disabled={!hasMatches}
            onClick={() => run((target) => target.replace(replacement))}
            className="btn ghost sm ml-0.5 font-normal [--ui-radius:4px]"
          >
            Replace
          </button>
          <button
            type="button"
            aria-label="Replace all"
            disabled={!hasMatches}
            onClick={() => run((target) => target.replaceAll(replacement))}
            className="btn ghost sm font-normal [--ui-radius:4px]"
          >
            All
          </button>
        </div>
      )}
    </search>
  );
}

/** A sunk field with no border; the bar is its frame, and its options sit inside its end. */
const FIELD_CLASS =
  "input-group soft edgeless w-72 max-w-full min-w-0 [--control-height:2rem] [--input-group-gap:2px] [--input-group-pad:0.375rem] [--ui-radius:4px]";

function describeResult(query: FindQuery, result: FindResult): string {
  if (result.invalid) {
    return "Invalid regex";
  }
  if (query.text === "") {
    return "";
  }
  if (result.total === 0) {
    return "No results";
  }
  return result.current === null ? `${result.total} found` : `${result.current} of ${result.total}`;
}

interface BarButtonProps {
  /** Accessible name, also shown as the tooltip. */
  label: string;
  /** A literal `<i>` icon element, so the icon class stays visible to the icon build. */
  icon: ReactNode;
  onClick: () => void;
  /** Set for toggles: whether the option is on. */
  pressed?: boolean;
  /** Set for disclosure buttons: whether what they show is shown. */
  expanded?: boolean;
  disabled?: boolean;
  /** Set for a button inside a field, which is smaller so the field keeps its height. */
  isInField?: boolean;
}

function BarButton({ label, icon, onClick, pressed, expanded, disabled, isInField }: BarButtonProps) {
  const size = isInField ? "size-6! min-h-0! min-w-0! p-0! [--ui-radius:3px]" : "[--ui-radius:4px]";
  return (
    <Tooltip text={label} position="bottom" align="end" className="flex flex-none">
      {(bubbleId) => (
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          aria-pressed={pressed}
          aria-expanded={expanded}
          aria-describedby={bubbleId}
          className={`btn icon sm ${pressed || expanded ? "soft" : "ghost"} ${size}`}
        >
          {icon}
        </button>
      )}
    </Tooltip>
  );
}
