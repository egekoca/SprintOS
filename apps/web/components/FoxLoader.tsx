import { FoxMark } from "./Logo";

export function FoxLoader({ label = "Loading", compact = false }: { label?: string; compact?: boolean }) {
  return (
    <div className={`fox-loader${compact ? " fox-loader-compact" : ""}`} role="status" aria-live="polite">
      <span className="fox-loader-stage" aria-hidden="true">
        <span className="fox-loader-track" />
        <FoxMark size={compact ? 24 : 46} className="fox-loader-mark" decorative />
      </span>
      <span className="fox-loader-label">{label}</span>
    </div>
  );
}

export function FoxSpinner() {
  return <FoxMark size={19} className="fox-spinner" decorative />;
}
