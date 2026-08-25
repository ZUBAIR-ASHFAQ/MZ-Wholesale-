/** Displays the static professional ERP wireframe without changing live ERP data or API contracts. */
export function WireframePage(): React.JSX.Element {
  return (
    <section className="wireframe-preview-page">
      <div className="wireframe-preview-header">
        <div>
          <p className="eyebrow">UI wireframe</p>
          <h1>Wholesale ERP wireframe</h1>
          <p>
            Static design preview for the complete wholesale counter ERP. This page is isolated from
            production data and backend mutations.
          </p>
        </div>
        <a
          className="wireframe-preview-link"
          href="/wireframe/index.html"
          rel="noreferrer"
          target="_blank"
        >
          Open full screen
        </a>
      </div>
      <iframe
        className="wireframe-preview-frame"
        src="/wireframe/index.html"
        title="Wholesale ERP professional wireframe preview"
      />
    </section>
  );
}
