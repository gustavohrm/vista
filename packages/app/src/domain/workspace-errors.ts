import { createAppError, createErrorRegistry, type ReadonlyErrorRegistry } from "@codenhub/error";

import { WORKSPACE_ERROR_KINDS, WorkspaceError, type WorkspaceCapability, type WorkspaceErrorKind } from "../ports";

/**
 * The platform failures an adapter recognizes, each named by the kind it is. A failure none of them
 * matches is `"unknown"`.
 */
export interface PlatformFailures {
  /** Error names, such as a `DOMException`'s `name`, and the kind each one is. */
  readonly names?: Readonly<Record<string, WorkspaceErrorKind>>;
  /** Patterns tested against an error's message, or against a thrown string, and the kind each match is. */
  readonly patterns?: readonly (readonly [pattern: RegExp, kind: WorkspaceErrorKind])[];
}

// The registry's codes are the kinds. Their messages are never shown: the interface words each kind from
// its dictionaries, so the registry only has to classify.
const KIND_CODES: ReadonlyErrorRegistry = (() => {
  const registry = createErrorRegistry();
  registry.codes.addList(WORKSPACE_ERROR_KINDS.map((kind) => [kind, { message: `Workspace failure: ${kind}.` }]));
  return registry;
})();

/**
 * Builds the function an adapter turns a caught value into a `WorkspaceError` with. A `WorkspaceError`
 * is returned as it is; anything else is classified against `failures` and keeps the caught value as
 * its `cause`.
 *
 * @param failures - The platform failures the adapter recognizes.
 * @returns The classifier.
 * @throws `TypeError` if a name or pattern in `failures` is empty or not a `RegExp`.
 */
export function createWorkspaceErrorClassifier(failures: PlatformFailures): (caught: unknown) => WorkspaceError {
  const registry = createErrorRegistry([KIND_CODES]);
  registry.names.addList(Object.entries(failures.names ?? {}).map(([name, kind]) => [name, { code: kind }]));
  registry.patterns.addList((failures.patterns ?? []).map(([pattern, kind]) => [pattern, { code: kind }]));

  return (caught) => {
    if (caught instanceof WorkspaceError) {
      return caught;
    }
    const { code } = createAppError(caught, { registry });
    const kind = WORKSPACE_ERROR_KINDS.find((known) => known === code) ?? "unknown";
    return new WorkspaceError(kind, describeCaught(caught), { cause: caught });
  };
}

/**
 * Wraps every method of a workspace capability so that each failure leaving it is a `WorkspaceError`,
 * classified against `failures`. Values that are not functions, such as `isSupported`, are copied.
 *
 * @param capability - The adapter's capability.
 * @param failures - The platform failures the adapter recognizes.
 * @returns A capability with the same members whose methods reject only with `WorkspaceError`s.
 */
export function classifyWorkspaceFailures(
  capability: WorkspaceCapability,
  failures: PlatformFailures,
): WorkspaceCapability {
  const classify = createWorkspaceErrorClassifier(failures);
  const wrapped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(capability)) {
    wrapped[key] =
      typeof value === "function"
        ? async (...args: unknown[]) => {
            try {
              return await (value as (...a: unknown[]) => Promise<unknown>).apply(capability, args);
            } catch (caught) {
              throw classify(caught);
            }
          }
        : value;
  }
  return wrapped as unknown as WorkspaceCapability;
}

/** The kind of a failure the interface caught: a `WorkspaceError`'s own, else `"unknown"`. */
export function workspaceErrorKind(caught: unknown): WorkspaceErrorKind {
  return caught instanceof WorkspaceError ? caught.kind : "unknown";
}

function describeCaught(caught: unknown): string {
  if (caught instanceof Error) {
    return caught.message;
  }
  return typeof caught === "string" ? caught : "A workspace operation failed.";
}
