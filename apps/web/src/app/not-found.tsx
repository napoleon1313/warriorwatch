import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="text-2xl font-bold">Nothing here</h1>
      <p className="mt-2 text-muted">That page doesn&apos;t exist.</p>
      <Link href="/" className="mt-6 inline-block rounded-lg bg-accent px-4 py-2 font-semibold text-white dark:text-zinc-950">
        See live counts
      </Link>
    </main>
  );
}
