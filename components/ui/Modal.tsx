"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Makes an element behave as a proper dialog: focus moves into it, Tab stays inside, Escape closes it,
 * the page behind does not scroll, and focus goes back to what opened it when it closes.
 */
export function useDialog(ref: React.RefObject<HTMLElement>, onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const opener = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusables = () => Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);
    // start on the first control, or the dialog itself when it has none
    (focusables()[0] ?? root).focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, [ref]);
}

interface ModalProps {
  title: string;
  /** Smaller text under the title */
  subtitle?: string;
  onClose: () => void;
  /** "alertdialog" for confirmations */
  role?: "dialog" | "alertdialog";
  className?: string;
  children: React.ReactNode;
}

/** A centred dialog with a dimmed backdrop. Tapping the backdrop closes it. */
export function Modal({ title, subtitle, onClose, role = "dialog", className, children }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialog(ref, onClose);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn("flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-xl outline-none sm:rounded-xl", className ?? "max-w-lg")}
      >
        <div className="flex items-start justify-between gap-3 border-b border-ink-200 px-5 py-3">
          <div className="min-w-0">
            <h2 id={titleId} className="font-serif text-lg">
              {title}
            </h2>
            {subtitle && <p className="truncate text-xs text-ink-700">{subtitle}</p>}
          </div>
          {role === "dialog" && (
            <button onClick={onClose} aria-label="Close" className="-m-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg hover:bg-ink-100">
              <X size={18} />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
