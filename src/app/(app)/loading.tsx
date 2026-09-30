// Shown while a page's server part loads (e.g. switching pages in the sidebar).
export default function AppLoading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse">
      <div className="mb-6 h-10 w-48 rounded-md bg-light/70" />
      <div className="h-64 rounded-lg border border-light bg-white" />
    </div>
  );
}
