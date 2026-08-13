"use client";
//
// This is a CLIENT component. "use client" at the top means it runs in the
// browser, so it can respond to clicks and show a loading state.
//
// It draws one ON/OFF switch. When clicked, it calls our toggle web address,
// then refreshes the page so the new state shows.

import { useState } from "react";
import { useRouter } from "next/navigation";

// The data this switch needs about its meeting.
interface Props {
  googleEventId: string;
  title: string;
  startTime: string;
  meetingUrl: string;
  initialEnabled: boolean;
}

export default function MeetingToggle({
  googleEventId,
  title,
  startTime,
  meetingUrl,
  initialEnabled,
}: Props) {
  // `enabled` remembers if the switch is ON. `pending` shows a spinner state.
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleToggle() {
    const next = !enabled; // the state we want to move to.
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/meetings/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          googleEventId,
          title,
          startTime,
          meetingUrl,
          enable: next,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");

      setEnabled(next);
      router.refresh(); // reload server data so the list stays correct.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleToggle}
        disabled={pending}
        aria-pressed={enabled}
        aria-label={enabled ? "Turn recording bot off" : "Turn recording bot on"}
        className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-teal-500 disabled:opacity-50 ${
          enabled ? "bg-teal-600" : "bg-zinc-300 dark:bg-zinc-700"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
            enabled ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
      <span className="text-xs text-zinc-500 dark:text-zinc-400">
        {pending ? "Saving…" : enabled ? "Bot on" : "Bot off"}
      </span>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
