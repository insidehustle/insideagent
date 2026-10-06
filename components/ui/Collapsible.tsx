"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

interface Props {
  /** Stable key; the open or closed state is remembered per browser under this id. */
  id: string;
  title: React.ReactNode;
  defaultOpen?: boolean;
  /** Plain section without the card border, for use inside another card. */
  bare?: boolean;
  className?: string;
  children: React.ReactNode;
}

const KEY = (id: string) => `bas.panel.${id}`;
const ALL_EVENT = "bas-panels";

/** Opens or closes every card-style panel on the page (and remembers it). */
export function setAllPanels(state: "open" | "closed") {
  window.dispatchEvent(new CustomEvent(ALL_EVENT, { detail: state }));
}

/**
 * A card whose body can be collapsed. Content stays mounted while collapsed, so typed text,
 * loaded lists and running work are not lost.
 */
export function CollapsibleCard({ id, title, defaultOpen = true, bare = false, className, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY(id));
      if (saved === "open") setOpen(true);
      else if (saved === "closed") setOpen(false);
    } catch {
      // storage unavailable
    }
  }, [id]);

  useEffect(() => {
    if (bare) return;
    const onAll = (e: Event) => {
      const state = (e as CustomEvent<"open" | "closed">).detail;
      setOpen(state === "open");
      try {
        localStorage.setItem(KEY(id), state);
      } catch {
        // storage unavailable
      }
    };
    window.addEventListener(ALL_EVENT, onAll);
    return () => window.removeEventListener(ALL_EVENT, onAll);
  }, [id, bare]);

  function toggle() {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(KEY(id), next ? "open" : "closed");
    } catch {
      // storage unavailable
    }
  }

  const panelId = `panel-${id}`;
  return (
    <section className={cn(!bare && "rounded-xl border border-ink-200 bg-white", className)}>
      <h2 className="m-0">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={panelId}
          className={cn(
            "flex w-full items-center justify-between gap-2 text-left font-semibold",
            bare ? "py-1 text-xs" : "rounded-xl px-5 py-3 hover:bg-ink-50",
          )}
        >
          <span className="flex min-w-0 items-center gap-2">{title}</span>
          <ChevronDown size={16} className={cn("shrink-0 text-ink-700 transition-transform", !open && "-rotate-90")} />
        </button>
      </h2>
      <div id={panelId} hidden={!open} className={cn("space-y-3", !bare && "px-5 pb-5", bare && "pt-1")}>
        {children}
      </div>
    </section>
  );
}
