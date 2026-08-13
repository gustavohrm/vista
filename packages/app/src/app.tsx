import type { AppAdapter } from "./ports";

interface AppProps {
  adapter: AppAdapter;
}

/**
 * Renders the shared Vista application for a platform host.
 *
 * @param props - Shared application properties, including the host adapter.
 * @returns Shared application UI configured for the supplied platform.
 */
export function App({ adapter }: AppProps) {
  return (
    <main
      className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100"
      data-platform={adapter.platform}
    >
      <div className="max-w-xl text-center">
        <p className="mb-3 text-xs font-semibold tracking-[0.3em] text-cyan-400 uppercase">Local-first workspace</p>
        <h1 className="text-5xl font-semibold tracking-tight">Vista</h1>
        <p className="mt-4 text-balance text-slate-400">Notes, files, and structured data in one focused workspace.</p>
      </div>
    </main>
  );
}
