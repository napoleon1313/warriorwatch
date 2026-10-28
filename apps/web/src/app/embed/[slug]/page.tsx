import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EmbedCard } from "@/components/EmbedCard";
import { LIVE_SLUGS, SLUG_TO_ID, display } from "@/lib/facilities";

export const dynamicParams = false;
export function generateStaticParams() {
  return LIVE_SLUGS.map((slug) => ({ slug }));
}

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const id = SLUG_TO_ID[slug];
  return { title: id ? `${display(id).title} widget` : "Widget", robots: { index: false } };
}

export default async function EmbedPage({ params }: { params: Params }) {
  const { slug } = await params;
  if (!SLUG_TO_ID[slug]) notFound();
  return (
    <main className="p-0">
      <EmbedCard slug={slug} />
    </main>
  );
}
