import { ClientOnly } from "@/components/ClientOnly";
import { LiveBoard } from "@/components/LiveBoard";

export default function LivePage() {
  return (
    <>
      <div className="mb-4">
        <p className="eyebrow mb-1">01 · live</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">How busy is the gym?</h1>
        <p className="mt-1 max-w-xl text-sm text-muted">
          Live headcounts for every tracked room at the PAC and CIF, what&apos;s usual for this hour, and when each one opens next.
        </p>
      </div>
      <ClientOnly fallback={<div className="skeleton h-64 w-full" aria-hidden="true" />}>
        <LiveBoard />
      </ClientOnly>
    </>
  );
}
