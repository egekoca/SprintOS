# Pilot Instruments — Interview Script & Feedback Form

Drafted 2026-10-02 per the Customer Development Plan's Week 1–2 commitment:
"Write the structured feedback form and a 15 to 20 minute interview script
that opens on the reviewer's current process rather than on the product, so
H1, H2 and H4 are tested before SprintOS is described." These are text
instruments only — running them still needs real pilot participants (see
`docs/MONTH-2-COMPLETION-PLAN.md`, Section 3.1, for what that requires).

## 1. Recruitment message (adapt per contact)

> Hi [name] — I'm running a short pilot for SprintOS, a tool that gives grant
> reviewers a shared, verifiable record of a milestone: the acceptance
> criteria, the evidence, an AI-generated advisory read (never binding), and
> the human decision, all tied to the actual Stellar payment. I'd like 20
> minutes of your time to walk through [your own review process / a real
> milestone], not to pitch the product — I want to understand what's actually
> slow or ambiguous about reviewing work today before I describe what I built.
> Would [day/time] work?

Target roughly five named participants across three roles, per the SOW: at
least one programme sponsor/Chapter-Lead-equivalent, one or two builders who
have submitted milestone evidence before, and the rest reviewers. Draw from
Stellar Türkiye, Instaward-adjacent, and SCF-adjacent contacts, per the plan's
own Week 1-2 activity.

## 2. Interview script (15–20 minutes, opens on their process, not the product)

**0. Before the call:** confirm their role (sponsor / builder / reviewer) and
which programme or context they're answering from. Record with permission —
one full session is a committed deliverable, not optional.

**1. Warm-up (2 min).** "Tell me about the last milestone you [reviewed /
delivered / paid out]. What was it for, roughly?"

**2. Current process — tests H1 (is manual review a felt cost) (6–8 min).**
- "Walk me through what you actually did to decide whether that milestone
  was done. What did you open, in what order?"
- "How long did that take you, roughly?"
- "Has a reviewer ever reached a different conclusion than you expected, on
  evidence you'd also seen? What happened?"
- "What's the part of that process you'd most like to not do by hand again?"
- "If a milestone needed revision, how did the first submission get kept
  around so you could compare it to the second?" *(listen for: nothing —
  versions overwrite, or live in chat/email, not in the system of record)*

**3. The AI-cannot-release boundary — tests H2 (do they want a stronger
guarantee, or does the market actually want automation) (4–5 min).**
- "If a tool scored a submission for you — not decided, just scored it as an
  assistant — would you trust its score more or less if you knew it was
  *structurally incapable* of releasing the payment itself, even by mistake?"
- "Is there a version of this where you'd actually want the AI to approve or
  pay automatically? What would have to be true for you to trust that?"
  *(this is the question that invalidates H2 if the answer is "yes, and
  here's when" — listen for it rather than defend the thesis)*

**4. Funding mechanics — tests H4 (will they route real funds through
escrow) (4–5 min).**
- "Today, when do funds actually move relative to the decision — before,
  after, held somewhere in between?"
- "Would you (or your programme) be willing to fund a milestone into an
  escrow contract up front, rather than approve and then pay from your own
  treasury afterward? What would make that a hard no?"
- "Who would need to sign off before your programme moved real money through
  something like this?"

**5. Wrap (1–2 min).** "If I had this ready for a real milestone of yours in
the next two weeks, would you run one through it?" *(a yes here is itself a
pilot recruitment close — follow up immediately while the answer is fresh)*

Do not explain the product's own architecture before Section 4 is done. The
plan deliberately orders discovery before the pitch.

## 3. Structured feedback form (fill in after they've used the Mainnet beta)

1. Role in this engagement: Sponsor / Builder / Reviewer / Observer.
2. On a scale of 1–5, how clear was it what evidence would be considered
   sufficient *before* you submitted or reviewed anything?
3. What did you open, click, or look for that wasn't there?
4. Where did you hesitate, or have to guess what to do next?
5. Did the advisory report change your decision, or just confirm what you'd
   already concluded from the evidence? (free text)
6. Did you understand, without being told, that the AI's score could not by
   itself approve or release anything? Where did that become clear — or did
   it not?
7. If this required a second (or third) reviewer's sign-off, was that
   friction worth it, or would one reviewer's decision have been enough?
8. Would you use this again for a real engagement, unprompted? Why or why
   not?
9. Anything that felt broken, slow, or untrustworthy?
10. Open feedback.

Map responses back to the hypothesis table (H1–H7 in the Customer
Development Plan) when writing the verdict table for the final evidence
package — this form's answers are the raw material for that table, not a
separate exercise.
