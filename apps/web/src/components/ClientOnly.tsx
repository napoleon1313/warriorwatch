"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Renders children only after mount. Every page is a static export built at
 * one instant, while the UI depends on the viewer's clock (today's date chips,
 * open/closed, "usual Wednesday"). Rendering those on the client only avoids
 * hydration mismatches between build time and view time.
 */
export function ClientOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? <>{children}</> : <>{fallback}</>;
}
