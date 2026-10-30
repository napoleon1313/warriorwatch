import type { Metadata } from "next";
import Link from "next/link";
import { SOURCE } from "@warriorwatch/contract";
import { LabelPill } from "@/components/LabelPill";
import { CopySnippet } from "@/components/CopySnippet";
import { API_BASE, USING_MOCK } from "@/lib/api";
import { apiDocsHtml } from "@/lib/apidocs";
import { thresholdCopy } from "@/lib/labels";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "About the data and API",
  description: "Where the counts come from, how often they change, what the labels mean, and the free public JSON API.",
  alternates: { canonical: "/about" },
};

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="mt-10 scroll-mt-20 text-xl font-semibold tracking-tight">
      {children}
    </h2>
  );
}

export default async function AboutPage() {
  const docs = await apiDocsHtml();
  const base = USING_MOCK ? "https://warriorwatch-api.warriorwatch-worker.workers.dev" : API_BASE;
  return (
    <article className="max-w-2xl pb-4 text-[15px] leading-relaxed">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">About WarriorWatch</h1>
      <p className="mt-3 text-muted">
        One page that answers &ldquo;is the gym packed right now?&rdquo; for the PAC and CIF, and &ldquo;is there a seat at Davis?&rdquo; for the
        libraries, plus what&apos;s usual for this hour and the quietest time to go. It&apos;s a student project and is{" "}
        <strong className="text-fg">not affiliated with the University of Waterloo</strong>, Warrior Athletics &amp; Recreation, or the Library.
      </p>

      <H2 id="source">Where the number comes from</H2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
        <li>
          Athletics publishes a live headcount for seven spaces on its{" "}
          <a className="text-accent underline underline-offset-2" href={SOURCE.occupancyUrl} rel="noopener">
            Facility Occupancy page
          </a>
          . We read that public page once a minute (scraping, not an official feed) and keep a copy of every change.
        </li>
        <li>
          The count is driven by WatCard tap-ins and tap-outs at the door, plus manual corrections by staff. People who leave without
          tapping out, or a counter that staff reset, show up as-is. We don&apos;t smooth or &ldquo;fix&rdquo; it.
        </li>
        <li>
          The official count doesn&apos;t change every minute. &ldquo;Updated 4 min ago&rdquo; means the number last <em>changed</em> 4 minutes
          ago, not when we last looked. A count that hasn&apos;t moved in a long time (common late at night, or in the Esports lounge) is
          usually just a quiet room.
        </li>
        <li>
          When the official page shows its own &ldquo;results not live&rdquo; banner, we show a warning too.
        </li>
        <li>Open / closed comes from the regular hours on each facility page. Holidays, varsity events and bookings can override them, so check the official calendar linked on each facility page.</li>
      </ul>

      <H2 id="libraries">The libraries</H2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
        <li>
          Dana Porter, Davis Centre and Musagetes publish how full they are through{" "}
          <a className="text-accent underline underline-offset-2" href={SOURCE.waitzPageUrl} rel="noopener">
            Waitz
          </a>
          , the same numbers the Library shows on its own site. Sensors on each floor count nearby Bluetooth and Wi-Fi devices and estimate
          people from that, so a library count is an estimate (the Library quotes about 95%), not a turnstile count like the gyms.
        </li>
        <li>
          We read Waitz&apos;s public feed every five minutes, which is about how often the sensors update, and keep a change when a floor moves
          by at least 1% of its seats. A whole-building total is its own sensor reading, so the floors don&apos;t add up to it exactly.
        </li>
        <li>
          Library hours are the regular-term hours from the{" "}
          <a className="text-accent underline underline-offset-2" href={SOURCE.libraryHoursUrl} rel="noopener">
            Library&apos;s hours page
          </a>
          . Exam periods, reading week and holidays differ; we&apos;ll show a floor as open when it isn&apos;t if the Library has changed its hours.
        </li>
      </ul>

      <H2 id="labels">What the labels mean</H2>
      <p className="mt-3 text-muted">Labels are the share of the posted maximum occupancy, the same cut-offs the API uses:</p>
      <ul className="mt-3 space-y-2">
        {thresholdCopy().map((t) => (
          <li key={t.label} className="flex items-center gap-3 text-sm">
            <LabelPill label={t.label} className="w-20 justify-center" />
            <span className="text-muted">{t.range}</span>
          </li>
        ))}
      </ul>

      <H2 id="usual">&ldquo;Usual&rdquo; and how sure we are</H2>
      <p className="mt-3 text-muted">
        &ldquo;Usual&rdquo; is the median count for that weekday and 15-minute slot, kept separately for regular term, reading week, exams and
        breaks. The shaded band is the middle half of past days. We always say how many days it&apos;s based on (&ldquo;based on 3
        Tuesdays&rdquo;). With only a few weeks of data the band is wide and the &ldquo;best times&rdquo; are rough guesses; they get sharper every
        week.
      </p>

      <H2 id="privacy">Privacy</H2>
      <p className="mt-3 text-muted">
        Both sources only publish totals, so that&apos;s all we store: a number per room or floor per reading. No names, no WatCard data, no
        device identifiers, no tracking cookies on this site.
      </p>

      <H2 id="credit">Credit</H2>
      <p className="mt-3 text-muted">
        Earlier student trackers showed this was worth doing:{" "}
        <a className="text-accent underline underline-offset-2" href="https://github.com/benz206/uwpac" rel="noopener">
          uwpac
        </a>{" "}
        and{" "}
        <a className="text-accent underline underline-offset-2" href="https://github.com/pauligwe/PACked" rel="noopener">
          PACked
        </a>
        . Library seat counts are{" "}
        <a className="text-accent underline underline-offset-2" href={SOURCE.waitzPageUrl} rel="noopener">
          Waitz
        </a>
        &apos;s (Occuspace), which also set the design bar.
      </p>

      <H2 id="api">Public API</H2>
      <p className="mt-3 text-muted">
        Free, JSON, CORS open, cached at the edge. Please keep it under a request a minute per client; the numbers don&apos;t change faster than that.
      </p>
      <div className="mt-3">
        <CopySnippet code={`curl ${base}/api/live`} label="Example request" />
      </div>
      <div className="prose-api mt-4" dangerouslySetInnerHTML={{ __html: docs }} />

      <H2 id="embed">Embed</H2>
      <p className="mt-3 text-muted">Every facility page has a copy-paste snippet. For example:</p>
      <div className="mt-3">
        <CopySnippet
          label="Embed code"
          code={`<iframe src="${SITE_URL}/embed/pac-free-weights" title="PAC free weights occupancy" width="320" height="120" style="border:0;border-radius:16px" loading="lazy"></iframe>`}
        />
      </div>
      <p className="mt-6 text-sm text-muted">
        <Link href="/" className="underline underline-offset-2 hover:text-fg">
          ← Back to live counts
        </Link>
      </p>
    </article>
  );
}
