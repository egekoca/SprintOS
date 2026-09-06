"use client";

import { FoxMark } from "./Logo";

/**
 * The button that asks the fox to read the repository.
 *
 * A plain grey "Get score" gave no sign that anything interesting was behind
 * it. This one carries the fox itself, sits on a raised surface, and presses
 * down when clicked — the one control on the row that does something worth
 * waiting for should look like it.
 *
 * While it works the fox stays put and the label changes underneath, so the
 * thing you pressed is the thing that is thinking rather than a spinner
 * somewhere else on the page.
 */
export function ScoreButton({
  onClick,
  busy = false,
  disabled = false,
  label = "Get score",
}: {
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      className={`score-button${busy ? " is-busy" : ""}`}
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy}
    >
      {/* FoxMark, not FoxSculpture: the sculpture is a layered illustration
          with its own cast shadow and overflow, drawn for a hero slot. At button
          size it spilled over the label. */}
      <span className="score-button-fox">
        <FoxMark size={22} decorative />
      </span>
      <span className="score-button-label">{busy ? "Reading…" : label}</span>
    </button>
  );
}
