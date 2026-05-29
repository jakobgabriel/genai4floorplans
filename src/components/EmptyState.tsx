interface Props {
  onSample: () => void;
  onBlank: () => void;
  onImport: () => void;
}

// First-run onboarding: pick a starting point instead of facing a blank canvas.
export function EmptyState({ onSample, onBlank, onImport }: Props) {
  return (
    <div className="overlay">
      <div className="modal">
        <h2>
          FLOW<span style={{ color: "var(--teal)" }}>PLAN</span>
        </h2>
        <p>
          Rate a production cell across flow, balance, ergonomics and automation — then see a scored
          improved layout. Pick a starting point:
        </p>
        <button className="btn" onClick={onSample}>
          <strong>Start from the sample cell</strong>
          <br />
          <span style={{ color: "var(--textDim)" }}>A demo line you can edit and explore.</span>
        </button>
        <button className="btn" onClick={onBlank}>
          <strong>Start blank</strong>
          <br />
          <span style={{ color: "var(--textDim)" }}>An empty grid — add your own steps.</span>
        </button>
        <button className="btn" onClick={onImport}>
          <strong>Import a JSON model</strong>
          <br />
          <span style={{ color: "var(--textDim)" }}>Load a layout you exported before.</span>
        </button>
      </div>
    </div>
  );
}
