import { Component, type ErrorInfo, type ReactNode } from "react";

import { reportError } from "@/lib/observability";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Catches render-time crashes anywhere below it.
 *
 * Without this, a thrown error unmounts the whole React tree and leaves a
 * blank white screen — on a packaged mobile build there is no console to
 * check, so the failure is both invisible to the user and unreported.
 *
 * Deliberately has no reset-in-place button: React cannot guarantee the
 * state that caused the crash is gone, and an "try again" that re-crashes
 * instantly is worse than an honest reload.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // componentStack names the component that threw, which the stack trace
    // alone often does not after minification.
    reportError(error, { componentStack: info.componentStack });
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-3 px-8 text-center"
        style={{ background: "var(--app-bg)" }}
      >
        <h1 className="text-xl font-bold text-fg">Something went wrong</h1>
        <p className="max-w-xs text-sm text-fg-muted">
          The app hit an unexpected error. Your data is safe — reloading usually clears it.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-2 rounded-full bg-surface-inverse px-6 py-2.5 text-sm font-semibold text-fg-inverse"
        >
          Reload
        </button>
      </div>
    );
  }
}
