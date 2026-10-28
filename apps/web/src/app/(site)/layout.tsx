import { InstallHint } from "@/components/InstallHint";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-5xl px-4 pt-6">
        {children}
      </main>
      <SiteFooter />
      <InstallHint />
    </>
  );
}
