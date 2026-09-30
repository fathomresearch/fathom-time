"use client";

// Last resort when even the main layout fails. It replaces the whole page,
// so it can't rely on the app's styles or fonts.
export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#F4F6F7",
          color: "#2C3E50",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <title>Fathom Time</title>
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ color: "#0A1628", fontSize: 22, margin: 0 }}>Something went wrong</h1>
          <p style={{ fontSize: 14 }}>Fathom Time couldn&apos;t load. Check your connection and try again.</p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              marginTop: 12,
              height: 36,
              padding: "0 16px",
              border: 0,
              borderRadius: 6,
              background: "#00D6B3",
              color: "#0A1628",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
