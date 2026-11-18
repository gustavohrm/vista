import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

import type { WorkspaceColor, WorkspaceIcon } from "../../domain/workspaces";
import { WorkspaceGlyph } from "./workspace-glyph";

/** Whether Vista can read a folder now, needs the user's permission first, or can't find it. */
export type FolderStatus = "ready" | "needs-permission" | "unavailable";

/** A remembered workspace as the switcher and the start screen list it. */
export interface RecentWorkspace {
  id: string;
  name: string;
  icon: WorkspaceIcon;
  color: WorkspaceColor;
  /** Its folders, or null until Vista has looked them up. */
  folders: readonly { id: string; name: string; status: FolderStatus }[] | null;
  /** When it was last opened, in milliseconds since the epoch; 0 or absent when unknown. */
  lastOpenedAt?: number;
}

/** Space between the switcher and its list, in pixels. */
const LIST_OFFSET_PX = 4;

interface WorkspaceSwitcherProps {
  /** The open workspace, or null while none is. */
  current: RecentWorkspace | null;
  /** The recent workspaces, the most recent first, including the current one. */
  recents: readonly RecentWorkspace[];
  /** Every workspace, by name, which typing searches. */
  workspaces: readonly RecentWorkspace[];
  onSwitch: (workspaceId: string) => void;
  onOpenFolder: () => void;
  /** Opens a workspace's page in Settings. */
  onOpenSettings: (workspaceId: string) => void;
  onClose: () => void;
  /** Takes a workspace out of Recent without forgetting it. */
  onRemoveFromRecent: (workspaceId: string) => void;
  /** Whether the button is unavailable, as while the last workspace is still being restored. */
  isDisabled?: boolean;
}

type Option =
  | { kind: "workspace"; id: string; workspace: RecentWorkspace; isCurrent: boolean; isRecent: boolean }
  | { kind: "action"; id: string; label: string; icon: ReactNode; run: () => void };

/**
 * The switcher at the top left, showing the open workspace. Choosing it turns it into a search field
 * over a list: the recent workspaces, then Open Folder and Close Workspace. Typing searches every
 * workspace by name, and the actions stay below the matches; the arrow keys pick an entry and Enter chooses it. Each
 * workspace has a Settings button, shown while the pointer rests on it or it is picked, that opens its
 * page in Settings, also reached with `Ctrl+,`; each recent one but the open one can be removed from
 * Recent with its X or `Shift+Delete`, and the list stays open. Creating, editing, and deleting
 * workspaces live in Settings; adding a folder lives in the explorer's header.
 */
export function WorkspaceSwitcher({
  current,
  recents,
  workspaces,
  onSwitch,
  onOpenFolder,
  onOpenSettings,
  onClose,
  onRemoveFromRecent,
  isDisabled = false,
}: WorkspaceSwitcherProps) {
  const listId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Where the list opens, while the switcher is a search field; null while it is a button.
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  // Set as the field closes by keyboard or by a choice, so focus goes back to the button once it is back.
  const [isReturningFocus, setIsReturningFocus] = useState(false);
  // The list's width as it opened, kept while typing so it doesn't narrow and widen with the matches.
  const [listWidth, setListWidth] = useState<number | null>(null);
  const isOpen = anchor !== null;

  const needle = query.trim().toLocaleLowerCase();
  const matches = (text: string) => text.toLocaleLowerCase().includes(needle);
  const recentIds = new Set(recents.map((workspace) => workspace.id));
  const toOption = (workspace: RecentWorkspace): Option => ({
    kind: "workspace",
    id: workspace.id,
    workspace,
    isCurrent: workspace.id === current?.id,
    isRecent: recentIds.has(workspace.id),
  });
  // Typing searches every workspace, the recent ones first as they are listed, then the others by name.
  const workspaceOptions =
    needle === ""
      ? recents.map(toOption)
      : [
          ...recents.filter((workspace) => matches(workspace.name)),
          ...workspaces.filter((workspace) => !recentIds.has(workspace.id) && matches(workspace.name)),
        ].map(toOption);
  const actionOptions = [
    {
      kind: "action",
      id: "open-folder",
      label: "Open Folder…",
      icon: <i className="ic-folder-open" aria-hidden="true" />,
      run: onOpenFolder,
    },
    ...(current
      ? [
          {
            kind: "action",
            id: "close-workspace",
            label: "Close Workspace",
            icon: <i className="ic-folder-x" aria-hidden="true" />,
            run: onClose,
          } as const,
        ]
      : []),
  ] satisfies Option[];
  const options: Option[] = [...workspaceOptions, ...actionOptions];
  const active = Math.min(activeIndex, options.length - 1);
  // Typed text that finds no workspace; the actions still follow.
  const isEmptySearch = needle !== "" && workspaceOptions.length === 0;

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  useLayoutEffect(() => {
    setListWidth(isOpen ? (listRef.current?.offsetWidth ?? null) : null);
  }, [isOpen]);

  useEffect(() => {
    if (isReturningFocus) {
      buttonRef.current?.focus();
      setIsReturningFocus(false);
    }
  }, [isReturningFocus]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!listRef.current?.contains(target) && !fieldRef.current?.contains(target)) {
        setAnchor(null);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [isOpen]);

  useEffect(() => {
    // The picked entry stays in view as the arrow keys move past the list's visible area.
    document.getElementById(`${listId}-${active}`)?.scrollIntoView?.({ block: "nearest" });
  }, [active, listId]);

  const open = () => {
    const bounds = buttonRef.current?.getBoundingClientRect();
    if (!bounds) {
      return;
    }
    setQuery("");
    setActiveIndex(0);
    setAnchor({ x: bounds.left, y: bounds.bottom + LIST_OFFSET_PX });
  };
  const close = () => {
    setAnchor(null);
    setIsReturningFocus(true);
  };

  const choose = (option: Option | undefined) => {
    if (!option) {
      return;
    }
    close();
    if (option.kind === "action") {
      option.run();
    } else if (!option.isCurrent) {
      onSwitch(option.id);
    }
  };
  const openSettings = (option: Option | undefined) => {
    if (option?.kind === "workspace") {
      // Settings takes focus as it opens, so nothing goes back to the button.
      setAnchor(null);
      onOpenSettings(option.id);
    }
  };
  const remove = (option: Option | undefined) => {
    if (option?.kind === "workspace" && option.isRecent && !option.isCurrent) {
      onRemoveFromRecent(option.id);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const option = options[active];
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (options.length > 0) {
        const step = event.key === "ArrowDown" ? 1 : -1;
        setActiveIndex((active + step + options.length) % options.length);
      }
    } else if (event.key === "Enter") {
      choose(option);
    } else if (event.key === "Escape" || event.key === "Tab") {
      close();
    } else if (event.key === "Delete" && event.shiftKey) {
      remove(option);
    } else if (event.key === "," && (event.ctrlKey || event.metaKey)) {
      // Settings' own shortcut, here for the picked workspace rather than the open one.
      openSettings(option);
    } else {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  const optionId = (index: number) => `${listId}-${index}`;

  return (
    <>
      {/* The field lies over the button, which keeps its place, so nothing beside it moves: the
          search icon fades in over the tile, and the placeholder over the name. */}
      <div className="relative flex min-w-0 shrink">
        <button
          ref={buttonRef}
          type="button"
          aria-haspopup="listbox"
          aria-expanded="false"
          disabled={isDisabled}
          inert={isOpen}
          onClick={open}
          className={`enabled:hover:bg-hover flex h-8 min-w-0 shrink items-center gap-2 rounded-md pr-2 pl-[7px] text-[13px] transition-colors duration-100 disabled:opacity-60 ${current ? "text-text-strong font-semibold" : "text-text-muted"}`}
        >
          {current ? (
            <WorkspaceGlyph icon={current.icon} color={current.color} isTile className="text-xs" />
          ) : (
            // An empty tile, dashed like a hidden panel's glyph, keeps the name where a workspace's sits.
            <span
              aria-hidden="true"
              className="size-5 flex-none rounded-[5px] border border-dashed border-current opacity-60"
            />
          )}
          <span className="max-w-48 min-w-0 truncate">{current ? current.name : "No workspace"}</span>
          <i className="ic-chevrons-up-down text-text-faint flex-none text-xs" aria-hidden="true" />
        </button>
        {isOpen && (
          <div
            ref={fieldRef}
            // The selected fill over the title bar's own, opaque so the button doesn't show through.
            className="vista-fade bg-chrome absolute top-0 left-0 flex h-8 w-full min-w-56 items-center gap-2 rounded-md bg-[image:linear-gradient(var(--color-selected),var(--color-selected))] pr-2 pl-[7px] text-[13px]"
          >
            <span
              aria-hidden="true"
              className="text-text-faint flex size-5 flex-none items-center justify-center text-sm"
            >
              <i className="ic-search" />
            </span>
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-label="Search workspaces"
              aria-expanded="true"
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={options[active] ? optionId(active) : undefined}
              aria-keyshortcuts="Shift+Delete Control+,"
              placeholder="Search workspaces"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={handleKeyDown}
              className="text-text-strong placeholder:text-text-muted min-w-0 flex-1 bg-transparent p-0 outline-none"
            />
          </div>
        )}
      </div>
      {anchor &&
        createPortal(
          <div
            ref={listRef}
            id={listId}
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a combobox's popup listbox; a native select can't hold rich options or follow the field's arrow keys
            role="listbox"
            aria-label="Workspaces"
            // Choosing with the pointer keeps the typing in the field.
            onPointerDown={(event) => event.preventDefault()}
            style={{ left: anchor.x, top: anchor.y, minWidth: listWidth ?? undefined }}
            className="vista-menu vista-pop card soft floating fixed z-50 flex max-h-[calc(100vh-56px)] min-w-48 flex-col overflow-y-auto p-1 text-[13px] [--ui-radius-surface:8px]"
          >
            {isEmptySearch && <p className="text-text-muted px-2 py-1.5">No matching workspaces</p>}
            {options.map((option, index) => (
              <SwitcherOption
                key={`${option.kind}:${option.id}`}
                id={optionId(index)}
                option={option}
                isActive={index === active}
                hasSeparatorBefore={
                  option.kind === "action" && (isEmptySearch || options[index - 1]?.kind === "workspace")
                }
                onHighlight={() => setActiveIndex(index)}
                onChoose={() => choose(option)}
                onOpenSettings={() => openSettings(option)}
                onRemove={() => remove(option)}
              />
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

interface SwitcherOptionProps {
  id: string;
  option: Option;
  isActive: boolean;
  hasSeparatorBefore: boolean;
  onHighlight: () => void;
  onChoose: () => void;
  onOpenSettings: () => void;
  onRemove: () => void;
}

function SwitcherOption({
  id,
  option,
  isActive,
  hasSeparatorBefore,
  onHighlight,
  onChoose,
  onOpenSettings,
  onRemove,
}: SwitcherOptionProps) {
  const isWorkspace = option.kind === "workspace";
  const canRemove = isWorkspace && option.isRecent && !option.isCurrent;
  // The row is the menu's own: the icon column, the label, and the check at the right end. A workspace
  // adds its Settings button before the check, or before its X, shown while it is picked or under the
  // pointer and holding its space otherwise, so the list keeps its width.
  const revealClass = isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100";
  return (
    <>
      {/* oxlint-disable-next-line jsx-a11y/control-has-associated-label, jsx-a11y/prefer-tag-over-role -- a hairline with no label, not a control */}
      {hasSeparatorBefore && <div role="separator" className="bg-line -mx-1 my-1 h-px flex-none" />}
      {/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events -- the combobox field handles the keyboard: arrows pick an option and Enter chooses it */}
      <div
        id={id}
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- an option of the custom listbox above
        role="option"
        tabIndex={-1}
        aria-selected={isActive}
        aria-checked={isWorkspace ? option.isCurrent : undefined}
        onPointerMove={onHighlight}
        onClick={onChoose}
        className={`text-text group flex min-h-7 w-full flex-none cursor-pointer items-center gap-2 rounded px-2 text-left ${
          isActive ? "bg-selected" : ""
        } ${isWorkspace && !option.isCurrent ? "pr-1" : ""}`}
      >
        <span aria-hidden="true" className="flex w-4 flex-none justify-center text-sm">
          {isWorkspace ? (
            <WorkspaceGlyph icon={option.workspace.icon} color={option.workspace.color} isTile className="text-xs" />
          ) : (
            option.icon
          )}
        </span>
        <span className="flex-1 text-left whitespace-nowrap">{isWorkspace ? option.workspace.name : option.label}</span>
        {isWorkspace && (
          <RowButton
            title={`Settings for "${option.workspace.name}"`}
            onClick={onOpenSettings}
            className={`ml-4 ${revealClass}`}
          >
            <i className="ic-sliders-horizontal" />
          </RowButton>
        )}
        {isWorkspace && option.isCurrent && <i className="ic-check flex-none text-sm" aria-hidden="true" />}
        {canRemove && (
          <RowButton title={`Remove "${option.workspace.name}" from Recent`} onClick={onRemove} className={revealClass}>
            <i className="ic-x" />
          </RowButton>
        )}
      </div>
    </>
  );
}

function RowButton({
  title,
  onClick,
  className,
  children,
}: {
  title: string;
  onClick: () => void;
  className: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      // The keyboard reaches it as a key on the picked entry, so it is left out of the tab order and
      // the accessibility tree.
      tabIndex={-1}
      aria-hidden="true"
      title={title}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`icon-button text-text-faint size-5 text-xs ${className}`}
    >
      {children}
    </button>
  );
}
