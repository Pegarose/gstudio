export const dynamic = "force-dynamic";

type PassingQualityFixtureProps = {
  searchParams: Promise<{ variant?: string | string[] }>;
};

export default async function PassingQualityFixture({ searchParams }: PassingQualityFixtureProps) {
  const { variant } = await searchParams;
  const renderOnePixelDifference = variant === "one-pixel-diff";

  return (
    <main className="qualityFixture" data-quality-fixture="passing">
      <style>{`
        .qualityFixture {
          --fixture-paper: #fbfaf8;
          --fixture-ink: #1c1b1a;
          --fixture-muted: #6f6b65;
          --fixture-rule: #dedad4;
          --fixture-accent: #b7532e;
          box-sizing: border-box;
          min-block-size: 100svh;
          padding: clamp(1rem, 4vw, 4rem);
          overflow-x: clip;
          color: var(--fixture-ink);
          background: var(--fixture-paper);
          font-family: var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif;
        }

        .qualityFixture *,
        .qualityFixture *::before,
        .qualityFixture *::after { box-sizing: border-box; }

        .qualityFixtureShell {
          display: grid;
          gap: clamp(2rem, 5vw, 5rem);
          inline-size: min(100%, 70rem);
          margin-inline: auto;
        }

        .qualityFixtureHeader {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem 1rem;
          padding-block-end: 1rem;
          border-block-end: 1px solid var(--fixture-rule);
        }

        .qualityFixtureBrand,
        .qualityFixtureEyebrow,
        .qualityFixtureMeta {
          margin: 0;
          color: var(--fixture-muted);
          font-size: 0.75rem;
          font-weight: 650;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .qualityFixtureBrand { color: var(--fixture-ink); }

        .qualityFixtureIntro {
          display: grid;
          grid-template-columns: minmax(0, 1.35fr) minmax(14rem, 0.65fr);
          gap: clamp(1.25rem, 5vw, 4rem);
          align-items: end;
        }

        .qualityFixtureTitle {
          max-inline-size: 11ch;
          margin: 0.5rem 0 0;
          font-size: clamp(2.4rem, 7vw, 6.25rem);
          font-style: normal;
          font-weight: 620;
          letter-spacing: -0.065em;
          line-height: 0.94;
          text-wrap: balance;
        }

        .qualityFixtureSummary {
          max-inline-size: 31rem;
          margin: 0;
          color: var(--fixture-muted);
          font-size: clamp(1rem, 1.5vw, 1.125rem);
          line-height: 1.58;
        }

        .qualityFixtureGrid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          border: 1px solid var(--fixture-rule);
        }

        .qualityFixtureCard {
          display: grid;
          gap: 0.75rem;
          min-inline-size: 0;
          min-block-size: 12rem;
          padding: clamp(1rem, 3vw, 2rem);
          border-inline-end: 1px solid var(--fixture-rule);
        }

        .qualityFixtureCard:last-child { border-inline-end: 0; }

        .qualityFixtureCardNumber {
          color: var(--fixture-accent);
          font-family: var(--font-geist-mono), ui-monospace, monospace;
          font-size: 0.75rem;
          font-weight: 700;
        }

        .qualityFixtureCard h2 {
          margin: 0;
          font-size: 1.125rem;
          font-style: normal;
          font-weight: 650;
          letter-spacing: -0.025em;
        }

        .qualityFixtureCard p {
          margin: 0;
          color: var(--fixture-muted);
          font-size: 0.9375rem;
          line-height: 1.5;
        }

        .qualityFixtureFooter {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem 1rem;
          color: var(--fixture-muted);
          font-size: 0.75rem;
        }

        .qualityFixtureMarker {
          display: inline-block;
          max-inline-size: 100%;
          overflow: hidden;
          padding: 0.25rem 0.4rem;
          border: 1px solid var(--fixture-rule);
          font-family: var(--font-geist-mono), ui-monospace, monospace;
          overflow-wrap: anywhere;
        }

        .qualityFixtureOnePixelDifference {
          position: fixed;
          inset-block-start: 0;
          inset-inline-start: 0;
          z-index: 1;
          display: block;
          inline-size: 1px;
          block-size: 1px;
          pointer-events: none;
        }

        @media (max-width: 48rem) {
          .qualityFixtureIntro { grid-template-columns: minmax(0, 1fr); }
          .qualityFixtureTitle { max-inline-size: 12ch; }
          .qualityFixtureGrid { grid-template-columns: minmax(0, 1fr); }
          .qualityFixtureCard { min-block-size: auto; border-inline-end: 0; border-block-end: 1px solid var(--fixture-rule); }
          .qualityFixtureCard:last-child { border-block-end: 0; }
        }
      `}</style>

      <div className="qualityFixtureShell">
        <header className="qualityFixtureHeader">
          <p className="qualityFixtureBrand">G Studio / Quality fixture</p>
          <p className="qualityFixtureMeta">Deterministic release reference</p>
        </header>

        <section className="qualityFixtureIntro" aria-labelledby="quality-fixture-title">
          <div>
            <p className="qualityFixtureEyebrow">Responsive visual gate</p>
            <h1 className="qualityFixtureTitle" id="quality-fixture-title">
              A stable page should stay deliberate at every width.
            </h1>
          </div>
          <p className="qualityFixtureSummary">
            This isolated route uses no network data, browser state, clock, or generated values. It exists solely
            to make release screenshots and horizontal-overflow checks repeatable.
          </p>
        </section>

        <section className="qualityFixtureGrid" aria-label="Fixture quality checks">
          <article className="qualityFixtureCard">
            <span className="qualityFixtureCardNumber">01</span>
            <h2>One reading path</h2>
            <p>Clear type hierarchy and bounded line lengths keep the content legible on narrow screens.</p>
          </article>
          <article className="qualityFixtureCard">
            <span className="qualityFixtureCardNumber">02</span>
            <h2>Zero hidden width</h2>
            <p>Grid tracks use minimum-zero sizing so long content does not create horizontal document overflow.</p>
          </article>
          <article className="qualityFixtureCard">
            <span className="qualityFixtureCardNumber">03</span>
            <h2>Scoped masking</h2>
            <p>Only explicitly labelled volatile values receive a screenshot mask; layout pixels stay observable.</p>
          </article>
        </section>

        <footer className="qualityFixtureFooter">
          <span>Static fixture payload</span>
          <span className="qualityFixtureMarker" data-screenshot-dynamic="timestamp">
            fixture-timestamp-marker
          </span>
        </footer>
      </div>
      {renderOnePixelDifference ? (
        <svg
          aria-hidden="true"
          className="qualityFixtureOnePixelDifference"
          focusable="false"
          height="1"
          viewBox="0 0 1 1"
          width="1"
        >
          <rect fill="#1c1b1a" height="1" width="1" />
        </svg>
      ) : null}
    </main>
  );
}
