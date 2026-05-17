import React from "react";

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          role="alert"
          style={{
            position: "fixed",
            inset: 0,
            padding: 20,
            background: "#7f1d1d",
            color: "#fff",
            overflow: "auto",
            font: "12px/1.4 ui-monospace, monospace",
            zIndex: 9999,
          }}
        >
          <h1 style={{ font: "600 14px/1 -apple-system,sans-serif", margin: "0 0 12px" }}>
            App crashed
          </h1>
          <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>
            {this.state.error.message}
            {"\n\n"}
            {this.state.error.stack?.slice(0, 1200)}
          </pre>
          <p style={{ marginTop: 16, opacity: 0.8 }}>
            Reload the page to retry. If this persists, check Vercel env vars.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
