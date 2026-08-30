import Link from "next/link";
import {
  APP_URL,
  DEPLOYMENT,
  SAMPLE_REPORTS,
  SECTIONS,
  VERIFY_COMMANDS,
  countByStatus,
  type EvidenceStatus,
} from "@/lib/evidence";
import { ProductIcon } from "@/components/ProductIcon";

/**
 * The evidence pack, as a page.
 *
 * Section 6 of the Statement of Work is verified by an Ambassador Chapter Lead
 * "with minimal technical expertise", deliverable by deliverable. So this is
 * one link that answers the whole checklist: what was promised, what exists,
 * where to look, and — stated rather than hidden — what is still outstanding.
 *
 * Everything here is read from `lib/evidence.ts`, which also renders
 * `docs/EVIDENCE.md`, so the page and the committed document cannot disagree.
 */

export const metadata = {
  title: "SprintOS — evidence pack",
  description:
    "What the Statement of Work asks for, what exists, and where to check it — deliverable by deliverable.",
};

/* Orange means a person still has to act. That is the same rule the rest of the
   product follows, and it is exactly what an outstanding item is. */
const STATUS: Record<EvidenceStatus, { label: string; icon: "check" | "eye" | "milestone" }> = {
  done: { label: "Delivered", icon: "check" },
  partial: { label: "Partial", icon: "eye" },
  todo: { label: "Outstanding", icon: "milestone" },
};

export default function EvidencePage() {
  const outstanding = countByStatus("todo") + countByStatus("partial");

  return (
    <div className="shell evidence-page">
      <header className="evidence-head">
        <p className="eyebrow">Instawards · Statement of Work · Section 6</p>
        <h1>Evidence pack</h1>
        <p className="evidence-lede">
          Every requirement the Statement of Work names, what satisfies it, and where to check it
          without taking anyone&rsquo;s word for it. {outstanding > 0 ? (
            <>
              <strong>{outstanding}</strong> item{outstanding === 1 ? " is" : "s are"} still
              outstanding and marked as such below.
            </>
          ) : (
            <>Every item is delivered.</>
          )}
        </p>
      </header>

      <dl className="evidence-facts">
        <div>
          <dt>Network</dt>
          <dd>{DEPLOYMENT.network}</dd>
        </div>
        <div>
          <dt>Settlement contract</dt>
          <dd>
            <a href={DEPLOYMENT.contractExplorer} target="_blank" rel="noreferrer">
              {DEPLOYMENT.contractId}
            </a>
          </dd>
        </div>
        <div>
          <dt>Settlement asset</dt>
          <dd>
            <a href={DEPLOYMENT.usdcExplorer} target="_blank" rel="noreferrer">
              Testnet USDC · {DEPLOYMENT.usdcSacId}
            </a>
          </dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>
            <a href={DEPLOYMENT.repository} target="_blank" rel="noreferrer">
              {DEPLOYMENT.repository}
            </a>
          </dd>
        </div>
        <div>
          <dt>Public application</dt>
          <dd>{APP_URL ? <a href={APP_URL}>{APP_URL}</a> : <em>NEXT_PUBLIC_APP_URL is not set on this deployment.</em>}</dd>
        </div>
      </dl>

      {SECTIONS.map((section) => (
        <section className="evidence-section" id={section.id} key={section.id}>
          <header>
            <h2>{section.title}</h2>
            <span className="evidence-budget">{section.budget}</span>
          </header>
          <p className="evidence-asked">
            <b>Evidence asked for:</b> {section.asked}
          </p>

          <ol className="evidence-items">
            {section.items.map((item) => (
              <li className={`is-${item.status}`} key={item.requirement}>
                <span className="evidence-status">
                  <ProductIcon name={STATUS[item.status].icon} size={15} />
                  {STATUS[item.status].label}
                </span>
                <h3>{item.requirement}</h3>
                <p>{item.detail}</p>
                {item.refs && item.refs.length > 0 && (
                  <p className="evidence-refs">
                    {item.refs.map((ref) => (
                      ref.href.startsWith("/") ? (
                        <Link href={ref.href} key={ref.href}>{ref.label}</Link>
                      ) : (
                        <a href={ref.href} target="_blank" rel="noreferrer" key={ref.href}>{ref.label}</a>
                      )
                    ))}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </section>
      ))}

      <section className="evidence-section" id="samples">
        <header>
          <h2>The three sample reports</h2>
        </header>
        <p className="evidence-asked">
          Built from fixed drafts rather than a live model call, so regenerating them produces these
          hashes exactly. A sample that changed on every run would prove nothing.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Sample</th>
                <th>Advisory score</th>
                <th>Report hash</th>
              </tr>
            </thead>
            <tbody>
              {SAMPLE_REPORTS.map((sample) => (
                <tr key={sample.name}>
                  <td>{sample.name}</td>
                  <td>{sample.score} / 100</td>
                  <td className="mono-cell">{sample.hash}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="evidence-section" id="verify">
        <header>
          <h2>Check it yourself</h2>
        </header>
        <p className="evidence-asked">
          Clone the repository and run these. None of them need a wallet, a key, or an API token.
        </p>
        <ul className="evidence-commands">
          {VERIFY_COMMANDS.map((entry) => (
            <li key={entry.cmd}>
              <code>{entry.cmd}</code>
              <span>{entry.what}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
