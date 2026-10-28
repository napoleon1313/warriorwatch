import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-line">
      <div className="mx-auto max-w-5xl space-y-2 px-4 py-8 text-sm text-muted">
        <p>
          Counts come from the public{" "}
          <a className="underline underline-offset-2 hover:text-fg" href="https://warrior.uwaterloo.ca/FacilityOccupancy" rel="noopener">
            Facility Occupancy page
          </a>
          , checked once a minute. <Link href="/about" className="underline underline-offset-2 hover:text-fg">How it works</Link> ·{" "}
          <Link href="/about#api" className="underline underline-offset-2 hover:text-fg">API</Link>
        </p>
        <p>WarriorWatch is a student project. Not affiliated with the University of Waterloo.</p>
      </div>
    </footer>
  );
}
