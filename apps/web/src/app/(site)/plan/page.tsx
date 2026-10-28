import type { Metadata } from "next";
import { ClientOnly } from "@/components/ClientOnly";
import Link from "next/link";
import { Planner } from "@/components/Planner";

export const metadata: Metadata = {
  title: "Plan your workout",
  description: "Pick a gym and a day, get the quietest times to go, ranked.",
  alternates: { canonical: "/plan" },
};

export default function PlanPage() {
  return (
    <>
      <div className="mb-5">
        <p className="eyebrow mb-1">02 · plan</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Quietest times</h1>
        <p className="mt-1 max-w-xl text-sm text-muted">
          Pick a room and a day. We rank the stretches that are usually quietest while it&apos;s open. Doing more than one room?{" "}
          <Link href="/session" className="text-accent underline underline-offset-2">
            Build a session
          </Link>
          .
        </p>
      </div>
      <ClientOnly fallback={<div className="skeleton h-64 w-full" aria-hidden="true" />}>
        <Planner />
      </ClientOnly>
    </>
  );
}
