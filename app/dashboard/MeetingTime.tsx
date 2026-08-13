"use client";

// Shows a meeting's start time in the VIEWER's own timezone.
//
// Why this exists: the dashboard is a server component. On Vercel the server
// runs in UTC, so formatting the time there shows UTC (the wrong time for you).
// A "use client" component runs in the browser, which knows your local
// timezone — so we format the time here instead.

import { useEffect, useState } from "react";

export default function MeetingTime({ iso }: { iso: string }) {
  // `label` starts empty and is filled in after the component loads in the
  // browser. This keeps the first server render and first browser render the
  // same, which avoids a React "hydration" warning.
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    setLabel(
      new Date(iso).toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    );
  }, [iso]);

  return <span suppressHydrationWarning>{label ?? "…"}</span>;
}
