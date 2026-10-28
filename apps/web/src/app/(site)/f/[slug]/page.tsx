import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FacilityDetail } from "@/components/FacilityDetail";
import { LIVE_SLUGS, SLUG_TO_ID, display } from "@/lib/facilities";

export const dynamicParams = false;
export function generateStaticParams() {
  return LIVE_SLUGS.map((slug) => ({ slug }));
}

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const id = SLUG_TO_ID[slug];
  if (!id) return {};
  const d = display(id);
  const title = `${d.title} (${d.where})`;
  return {
    title,
    description: `How busy ${d.title} at ${d.where} is right now, what's usual for this hour, and the quietest times to go today.`,
    alternates: { canonical: `/f/${slug}` },
    openGraph: { title, images: [{ url: `/og/${slug}`, width: 1200, height: 630 }] },
  };
}

export default async function FacilityPage({ params }: { params: Params }) {
  const { slug } = await params;
  if (!SLUG_TO_ID[slug]) notFound();
  return <FacilityDetail slug={slug} />;
}
