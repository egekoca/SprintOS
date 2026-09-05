"use client";

import { useRef } from "react";
import { ProductIcon, type ProductIconName } from "@/components/ProductIcon";
import type { MilestoneForm } from "@/lib/sponsor-draft";
import { MAX_CRITERIA, MAX_MILESTONES } from "@sprintos/schemas/milestone";

type Update = (index: number, patch: Partial<MilestoneForm>) => void;

/** The editable plan: what gets delivered, by when, and for how much. */
export function MilestoneEditor({
  milestones,
  update,
  remove,
  add,
}: {
  milestones: MilestoneForm[];
  update: Update;
  remove: (index: number) => void;
  add: () => void;
}) {
  return (
    <section className="plan-timeline">
      <header>
        <div>
          <p className="eyebrow">Editable plan</p>
          <h3>Milestone timeline</h3>
        </div>
        <span>{milestones.length}/{MAX_MILESTONES}</span>
      </header>

      <div className="plan-line">
        {milestones.map((milestone, index) => (
          <article className="plan-milestone" key={index}>
            <span className="plan-node">0{index + 1}</span>
            <div className="plan-card">
              <div className="spread">
                <div className="field plan-title">
                  <label htmlFor={`title-${index}`}>Milestone</label>
                  <input
                    id={`title-${index}`}
                    type="text"
                    value={milestone.title}
                    onChange={(event) => update(index, { title: event.target.value })}
                    placeholder={`Milestone ${index + 1}`}
                  />
                </div>
                {milestones.length > 1 && (
                  <button type="button" className="plan-remove" onClick={() => remove(index)}>Remove</button>
                )}
              </div>

              <div className="field">
                <label htmlFor={`summary-${index}`}>Outcome</label>
                <textarea
                  id={`summary-${index}`}
                  rows={2}
                  value={milestone.summary}
                  onChange={(event) => update(index, { summary: event.target.value })}
                  placeholder="What will be delivered?"
                />
              </div>

              <MilestoneDates index={index} milestone={milestone} update={update} />

              <div className="field">
                <span className="group-label" id={`criteria-${index}-label`}>Must be true at delivery</span>
                <div className="criteria-list" role="group" aria-labelledby={`criteria-${index}-label`}>
                  {milestone.criteria.map((criterion, criterionIndex) => (
                    <div key={criterionIndex}>
                      <ProductIcon name="check" size={15} />
                      <input
                        type="text"
                        value={criterion}
                        onChange={(event) => update(index, {
                          criteria: milestone.criteria.map((value, currentIndex) => (
                            currentIndex === criterionIndex ? event.target.value : value
                          )),
                        })}
                        placeholder={`Checkable requirement ${criterionIndex + 1}`}
                      />
                    </div>
                  ))}
                  {milestone.criteria.length < MAX_CRITERIA && (
                    <button type="button" onClick={() => update(index, { criteria: [...milestone.criteria, ""] })}>
                      + Add criterion
                    </button>
                  )}
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>

      {milestones.length < MAX_MILESTONES && (
        <button type="button" className="btn btn-ghost" onClick={add}>+ Add milestone</button>
      )}
    </section>
  );
}

/**
 * When a milestone starts and falls due, and what it is worth.
 *
 * The dates carry their own calendar button rather than relying on the browser's
 * own indicator, which is a few grey pixels wedged inside the field and easy to
 * miss. Times are opt-in: most milestones are agreed in whole days, and a form
 * that demands an hour for every one of them is asking for a decision nobody
 * has made.
 */
function MilestoneDates({ index, milestone, update }: { index: number; milestone: MilestoneForm; update: Update }) {
  const exact = Boolean(milestone.startTime || milestone.deadlineTime);

  return (
    <>
      <div className="plan-dates">
        <div className="field">
          <label htmlFor={`start-${index}`}>Starts</label>
          <div className="picker-row">
            <PickerInput id={`start-${index}`} type="date" icon="calendar" hint="Pick a start date" value={milestone.startDate} onChange={(value) => update(index, { startDate: value })} />
            {exact && <PickerInput id={`start-time-${index}`} type="time" icon="clock" hint="Pick a start time" value={milestone.startTime} onChange={(value) => update(index, { startTime: value })} />}
          </div>
        </div>

        <span aria-hidden="true">&rarr;</span>

        <div className="field">
          <label htmlFor={`due-${index}`}>Due</label>
          <div className="picker-row">
            <PickerInput id={`due-${index}`} type="date" icon="calendar" hint="Pick a due date" min={milestone.startDate} value={milestone.deadline} onChange={(value) => update(index, { deadline: value })} />
            {exact && <PickerInput id={`due-time-${index}`} type="time" icon="clock" hint="Pick a due time" value={milestone.deadlineTime} onChange={(value) => update(index, { deadlineTime: value })} />}
          </div>
        </div>

        <div className="field plan-amount">
          <label htmlFor={`amount-${index}`}>USDC</label>
          <input
            id={`amount-${index}`}
            type="text"
            inputMode="decimal"
            value={milestone.amount}
            onChange={(event) => update(index, { amount: event.target.value })}
            placeholder="500"
          />
        </div>
      </div>

      <button
        type="button"
        className="plan-precise"
        onClick={() => update(index, exact ? { startTime: "", deadlineTime: "" } : { startTime: "09:00", deadlineTime: "18:00" })}
      >
        <ProductIcon name="clock" size={14} />
        {exact ? "Use whole days" : "Set exact times"}
      </button>

      <p className="plan-dates-note">
        {exact
          ? "Times are read in your own timezone and stored on chain as one exact moment."
          : "Due at the end of the day, in your own timezone."}
      </p>
    </>
  );
}

/**
 * A native date or time field with a legible button to open its picker.
 *
 * The button duplicates what the input already offers a keyboard, so it stays
 * out of the tab order and out of the accessibility tree; it exists so that the
 * calendar is something you can see and hit with a mouse.
 */
function PickerInput({
  id, type, icon, hint, value, min, onChange,
}: {
  id: string;
  type: "date" | "time";
  icon: ProductIconName;
  hint: string;
  value: string;
  min?: string;
  onChange: (value: string) => void;
}) {
  const field = useRef<HTMLInputElement>(null);

  function openPicker() {
    const input = field.current;
    if (!input) return;
    /* showPicker throws when the browser has no picker to show, or when it does
       not consider this a user gesture. Focusing the field is a working answer
       in both cases. */
    try {
      input.showPicker();
    } catch {
      input.focus();
    }
  }

  return (
    <span className={`picker picker-${type}`}>
      <input ref={field} id={id} type={type} value={value} min={min} onChange={(event) => onChange(event.target.value)} />
      <button type="button" className="picker-open" onClick={openPicker} tabIndex={-1} aria-hidden="true" title={hint}>
        <ProductIcon name={icon} size={16} />
      </button>
    </span>
  );
}
