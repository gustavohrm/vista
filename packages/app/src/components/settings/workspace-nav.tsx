import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { Tooltip } from "../feedback/tooltip";
import type { ManagedWorkspace } from "./workspace-manager";
import { WorkspaceNavItem } from "./workspace-nav-item";

/** How many workspaces the group lists at first, how many more each Show More adds, and how many it lists before See All. */
export const NAV_FIRST_COUNT = 8;
export const NAV_STEP_COUNT = 4;
export const NAV_MOST_COUNT = 12;

interface WorkspaceNavProps {
  /** Every workspace, by name. */
  workspaces: readonly ManagedWorkspace[];
  /** The workspace whose page shows, or null while one of Vista's sections does. */
  shownWorkspaceId: string | null;
  /** Lists every workspace, as See All shows them in place of Settings' sections. */
  isFullList: boolean;
  onSelectWorkspace: (workspaceId: string) => void;
  onNewWorkspace: () => void;
  onSeeAll: () => void;
}

/**
 * The Workspaces group of Settings' navigation: its label, with Search and New Workspace beside it,
 * then the workspaces by name. It lists the first eight, then four more with Show More, then See All
 * past twelve. The open workspace and the one whose page shows are always listed, in their place.
 * Search swaps the label for a field that lists every workspace whose name holds the text, uncapped.
 *
 * @param props - WorkspaceNav properties.
 * @returns The group's elements, laid out by the navigation.
 */
export function WorkspaceNav({
  workspaces,
  shownWorkspaceId,
  isFullList,
  onSelectWorkspace,
  onNewWorkspace,
  onSeeAll,
}: WorkspaceNavProps) {
  const [query, setQuery] = useState<string | null>(null);
  const [limit, setLimit] = useState(NAV_FIRST_COUNT);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // The item to focus once it is listed, such as the first one Show More adds.
  const [focusId, setFocusId] = useState<string | null>(null);

  const isSearching = query !== null;
  const needle = query?.trim().toLocaleLowerCase() ?? "";
  const isPinned = (workspace: ManagedWorkspace) => workspace.status === "open" || workspace.id === shownWorkspaceId;
  const listed =
    needle !== ""
      ? workspaces.filter((workspace) => workspace.name.toLocaleLowerCase().includes(needle))
      : isFullList
        ? workspaces
        : workspaces.filter((workspace, index) => index < limit || isPinned(workspace));
  const unlisted = workspaces.filter((workspace) => !listed.includes(workspace));
  // What Show More adds: the next four by name, less any already listed for being open or shown.
  const nextBatch = workspaces.slice(limit, limit + NAV_STEP_COUNT).filter((workspace) => !isPinned(workspace));
  const hasMore = needle === "" && !isFullList && unlisted.length > 0;

  useEffect(() => {
    if (focusId !== null) {
      listRef.current?.querySelector<HTMLElement>(`[data-workspace-id="${CSS.escape(focusId)}"]`)?.focus();
      setFocusId(null);
    }
  }, [focusId]);

  // The field replaces the label as search opens, so it takes focus once it is there.
  useEffect(() => {
    if (isSearching) {
      inputRef.current?.focus();
    }
  }, [isSearching]);

  const openSearch = () => setQuery("");
  const closeSearch = () => {
    setQuery(null);
    searchButtonRef.current?.focus();
  };
  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      // Settings closes on Escape too; this one only ends the search.
      event.preventDefault();
      closeSearch();
    }
  };

  return (
    <>
      {/* Below md the label hides with the others, and the buttons start the row. */}
      <div className="flex flex-none items-center gap-0.5 md:mb-1 md:pl-2.5">
        {isSearching ? (
          <input
            ref={inputRef}
            type="search"
            aria-label="Search workspaces"
            placeholder="Search workspaces"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleSearchKeyDown}
            className="text-text-strong placeholder:text-text-faint border-line h-6 w-32 min-w-0 rounded-md border bg-transparent px-1.5 text-xs outline-none focus-visible:border-[var(--focus-ring)] md:w-auto md:flex-1"
          />
        ) : (
          <span className="text-text-faint hidden flex-1 text-xs font-medium md:block">Workspaces</span>
        )}
        <Tooltip text={isSearching ? "Close Search" : "Search Workspaces"} position="bottom" className="flex flex-none">
          {(bubbleId) => (
            <button
              ref={searchButtonRef}
              type="button"
              onClick={isSearching ? closeSearch : openSearch}
              aria-label={isSearching ? "Close Search" : "Search Workspaces"}
              aria-describedby={bubbleId}
              className="icon-button size-7 text-base md:size-6 md:text-sm"
            >
              {isSearching ? <i className="ic-x" aria-hidden="true" /> : <i className="ic-search" aria-hidden="true" />}
            </button>
          )}
        </Tooltip>
        <Tooltip text="New Workspace" position="bottom" className="flex flex-none">
          {(bubbleId) => (
            <button
              type="button"
              onClick={onNewWorkspace}
              aria-label="New Workspace…"
              aria-describedby={bubbleId}
              className="icon-button size-7 text-base md:size-6 md:text-sm"
            >
              <i className="ic-plus" aria-hidden="true" />
            </button>
          )}
        </Tooltip>
      </div>
      <div ref={listRef} className="contents">
        {listed.map((workspace) => (
          <WorkspaceNavItem
            key={workspace.id}
            workspace={workspace}
            isCurrent={shownWorkspaceId === workspace.id}
            onSelect={() => onSelectWorkspace(workspace.id)}
          />
        ))}
      </div>
      {needle !== "" && listed.length === 0 && (
        <p className="text-text-muted flex h-7 flex-none items-center px-2.5 text-[13px] whitespace-nowrap">
          No matching workspaces
        </p>
      )}
      {hasMore &&
        (limit < NAV_MOST_COUNT && nextBatch.length > 0 ? (
          <MoreButton
            onClick={() => {
              setLimit(limit + NAV_STEP_COUNT);
              setFocusId(nextBatch[0]!.id);
            }}
          >
            Show {nextBatch.length} more
          </MoreButton>
        ) : (
          <MoreButton
            onClick={() => {
              onSeeAll();
              setFocusId(unlisted[0]?.id ?? null);
            }}
            isSeeAll
          >
            See all
          </MoreButton>
        ))}
    </>
  );
}

function MoreButton({
  onClick,
  isSeeAll = false,
  children,
}: {
  onClick: () => void;
  isSeeAll?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-see-all={isSeeAll || undefined}
      className="text-text-muted hover:text-text hover:bg-hover flex h-7 flex-none cursor-pointer items-center rounded-md px-2.5 text-[13px] whitespace-nowrap transition-colors duration-100 outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-ring)] md:w-full"
    >
      {children}
    </button>
  );
}
