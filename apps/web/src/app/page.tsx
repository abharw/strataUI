import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  description: "Living pages, not another wall of text.",
  robots: { index: false, follow: false },
};

// Staggers each line's entrance.
function delay(ms: number): CSSProperties {
  return { "--strata-enter-delay": `${ms}ms` } as CSSProperties;
}

const doorLink =
  "inline-flex min-h-11 items-center whitespace-nowrap font-medium text-foreground underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground/60";


export default function Home() {
  return (
    <>
      <a href="#main-content" className="strata-skip-link">
        Skip to page
      </a>
      <main
        id="main-content"
        tabIndex={-1}
        className="flex min-h-dvh flex-1 bg-background px-page-gutter text-foreground sm:px-page-gutter-wide"
        style={{
          paddingTop: "max(3rem, env(safe-area-inset-top, 0px))",
          paddingBottom: "max(3rem, env(safe-area-inset-bottom, 0px))",
        }}
      >
        {/* Bottom padding lifts the block to the optical centre. A token, not `vh`: iOS
            resolves `vh` against the large viewport while the parent is sized in `dvh`. */}
        <section className="m-auto w-full max-w-xl pb-12">
          <h1 className="strata-enter text-landing font-bold tracking-[-0.04em] sm:text-landing-wide">
            Strata
          </h1>
          <p
            className="strata-enter mt-5 max-w-md text-lead font-normal leading-7 tracking-[-0.01em]"
            style={delay(60)}
          >
            Living pages, not another wall of text.
          </p>
          <p
            className="strata-enter mt-10 flex min-h-11 flex-wrap items-center gap-1 text-ui leading-6 text-muted-foreground"
            style={delay(120)}
          >
            <span>Already connected?</span>
            <Link href="/home" className={`${doorLink} text-ui`}>
              Open your Strata
            </Link>
          </p>
          <p
            className="strata-enter mt-1 flex min-h-11 flex-wrap items-center gap-1 text-ui leading-6 text-muted-foreground"
            style={delay(180)}
          >
            <span>If you’re an agent, read:</span>
            {/* oxlint-disable-next-line nextjs/no-html-link-for-pages -- /llms.txt is
                a route handler that returns plain text, not a page; unlike
                eslint-config-next's version this rule doesn't resolve that, so it
                flags every root-relative href regardless of whether it names a page. */}
            <a href="/llms.txt" className={`font-mono text-meta ${doorLink}`}>
              /llms.txt
            </a>
          </p>
        </section>
      </main>
    </>
  );
}
