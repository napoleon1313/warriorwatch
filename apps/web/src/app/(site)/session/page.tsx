import type { Metadata } from "next";
import { ClientOnly } from "@/components/ClientOnly";
import { SessionBuilder } from "@/components/SessionBuilder";

export const metadata: Metadata = {
  title: "Build a session",
  description: "Chain rooms into a workout, drag to reorder, and see how crowded each stop usually is at that time. Find the quietest start.",
  alternates: { canonical: "/session" },
};

export default function SessionPage() {
  return (
    <>
      <div className="mb-4">
        <p className="eyebrow mb-1">03 · session</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Build a session</h1>
        <p className="mt-1 max-w-xl text-sm text-muted">
          Free weights, then cardio? Chain the rooms, drag them into order, and see how full each stop usually is when you&apos;d get there.
        </p>
      </div>
      <ClientOnly fallback={<div className="skeleton h-64 w-full" aria-hidden="true" />}>
        <SessionBuilder />
      </ClientOnly>
    </>
  );
}
