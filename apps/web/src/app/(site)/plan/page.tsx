import type { Metadata } from "next";
import { Planner } from "@/components/Planner";

export const metadata: Metadata = {
  title: "Plan your workout",
  description: "Pick a gym and a day, get the quietest times to go, ranked.",
  alternates: { canonical: "/plan" },
};

export default function PlanPage() {
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Plan your workout</h1>
      <p className="mt-1 mb-5 text-sm text-muted">Pick a spot and a day. We rank the stretches that are usually quietest while it&apos;s open.</p>
      <Planner />
    </>
  );
}
