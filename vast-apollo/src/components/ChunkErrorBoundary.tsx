import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
    children: ReactNode
}

interface State {
    failed: boolean
    recovering: boolean
}

const RELOAD_FLAG = 'chunk-reload-attempted'

/**
 * Recovers from a page chunk that fails to download.
 *
 * Pages are code-split, so opening one fetches a file named after the build that
 * produced it. Right after a deploy the installed service worker still holds the
 * previous build's precache: it claims the request because the URL is in its
 * manifest, but the new entry is not written yet, and the import rejects. React
 * has no way to resolve a lazy component after that, so <Suspense> falls back
 * forever — the user sees a spinner that never stops and no error anywhere.
 *
 * Reloading once fixes it: by then the new worker has activated and its precache
 * is populated. The flag makes it a single attempt, because a reload loop is far
 * worse than an error message.
 */
export class ChunkErrorBoundary extends Component<Props, State> {
    state: State = { failed: false, recovering: false }

    static getDerivedStateFromError(): Partial<State> {
        return { failed: true }
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error('[ChunkErrorBoundary]', error, info.componentStack)

        const message = error?.message ?? ''
        const isChunkError =
            /dynamically imported module|Importing a module script failed|Loading chunk|error loading dynamically imported module/i.test(
                message
            )

        if (!isChunkError) return

        if (sessionStorage.getItem(RELOAD_FLAG)) {
            // Already tried. Showing the message beats reloading in a circle.
            return
        }

        this.setState({ recovering: true })
        sessionStorage.setItem(RELOAD_FLAG, '1')

        // Drop the stale worker and its caches first, otherwise the reload is
        // served the same broken precache and fails again.
        void (async () => {
            try {
                if ('caches' in window) {
                    const keys = await caches.keys()
                    await Promise.all(keys.map((k) => caches.delete(k)))
                }
                if ('serviceWorker' in navigator) {
                    const regs = await navigator.serviceWorker.getRegistrations()
                    await Promise.all(regs.map((r) => r.unregister()))
                }
            } catch (cleanupError) {
                console.warn('[ChunkErrorBoundary] cleanup failed', cleanupError)
            } finally {
                window.location.reload()
            }
        })()
    }

    render() {
        if (this.state.recovering) {
            return (
                <div className="min-h-screen bg-[var(--color-surface)] flex items-center justify-center p-6">
                    <div className="text-center">
                        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-indigo-500 border-r-transparent" />
                        <p className="mt-4 text-[var(--color-text-muted)]">Updating to the latest version…</p>
                    </div>
                </div>
            )
        }

        if (this.state.failed) {
            return (
                <div className="min-h-screen bg-[var(--color-surface)] flex items-center justify-center p-6">
                    <div className="max-w-sm text-center">
                        <h1 className="text-lg font-semibold text-[var(--color-text)]">This page didn't load</h1>
                        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                            Check your internet connection, then try again.
                        </p>
                        <button
                            onClick={() => {
                                sessionStorage.removeItem(RELOAD_FLAG)
                                window.location.reload()
                            }}
                            className="mt-5 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-500"
                        >
                            Try again
                        </button>
                    </div>
                </div>
            )
        }

        return this.props.children
    }
}

/** Clears the one-shot flag once a page has rendered successfully. */
export function clearChunkReloadFlag() {
    try {
        sessionStorage.removeItem(RELOAD_FLAG)
    } catch {
        // Private-mode storage restrictions; nothing useful to do.
    }
}
