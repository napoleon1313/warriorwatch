import { LiveBoard } from "@/components/LiveBoard";

export default function LivePage() {
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">How busy is the gym?</h1>
      <p className="mt-1 mb-4 text-sm text-muted">Live headcounts at the PAC and CIF. Refreshes every minute.</p>
      <LiveBoard />
    </>
  );
}
