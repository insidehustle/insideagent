"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { BookOpenText, BookText, Compass, GraduationCap, Image as ImageIcon, LayoutDashboard, LogOut, Megaphone, Menu, PenLine, Plus, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { ProjectProvider, useProject } from "./ProjectProvider";
import { ServiceStatusBanner } from "./ServiceStatusBanner";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/ikigai", label: "Ikigai Core", icon: Compass },
  { href: "/dashboard/research", label: "Research", icon: BookOpenText },
  { href: "/dashboard/studio", label: "Content Studio", icon: PenLine },
  { href: "/dashboard/manuscript", label: "Manuscript", icon: BookText },
  { href: "/dashboard/marketing", label: "Marketing", icon: Megaphone },
  { href: "/dashboard/tutorial", label: "Tutorial", icon: GraduationCap },
];

/** The brand, project picker, page links and account. Shared by the desktop sidebar and the mobile drawer. */
function SidebarContent() {
  const pathname = usePathname();
  const { projects, current, select } = useProject();
  const { data: session } = useSession();
  return (
    <>
      <Link href="/" className="hidden font-serif text-lg font-semibold md:block">
        Book Automation
      </Link>
      <Link
        href="/dashboard/projects/new"
        className={cn(
          "flex items-center justify-center gap-2 rounded-lg px-3 py-3 text-sm font-medium md:py-2",
          pathname === "/dashboard/projects/new" ? "bg-accent-dark text-white" : "bg-accent text-white hover:bg-accent-dark",
        )}
      >
        <Plus size={16} /> New project
      </Link>
      {projects.length > 0 && (
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-700/70">Project</span>
          <select className="w-full" value={current?.id ?? ""} onChange={(e) => select(e.target.value)}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
      )}
      <nav className="flex flex-col gap-1" aria-label="Main">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 whitespace-nowrap rounded-lg px-3 py-3 text-sm md:gap-2 md:py-2",
                active ? "bg-accent-soft font-medium text-accent-dark" : "text-ink-700 hover:bg-ink-100",
              )}
            >
              <Icon size={18} className="md:h-4 md:w-4" />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-ink-200 pt-4 text-xs text-ink-700">
        <span className="truncate" title={session?.user?.email ?? ""}>
          {session?.user?.email}
        </span>
        <button onClick={() => void signOut({ callbackUrl: "/login" })} className="flex shrink-0 items-center gap-1 py-2 hover:text-accent-dark">
          <LogOut size={12} /> Sign out
        </button>
      </div>
      <p className="flex items-center gap-2 text-xs text-ink-700/60">
        <ImageIcon size={12} /> Cover Studio lives in Marketing
      </p>
    </>
  );
}

/** Phone and small tablet: a top bar with a menu button that opens the navigation as a slide-in drawer. */
function MobileNav() {
  const pathname = usePathname();
  const { current } = useProject();
  const [open, setOpen] = useState(false);
  const pageLabel = NAV.find((n) => n.href === pathname)?.label ?? (pathname === "/dashboard/projects/new" ? "New project" : "Book Automation");

  // close after choosing a page
  useEffect(() => setOpen(false), [pathname]);

  // lock page scroll behind the drawer, and let Escape close it
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-ink-200 bg-white px-3 py-2">
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-900 hover:bg-ink-100"
        >
          <Menu size={22} />
        </button>
        <div className="min-w-0">
          <p className="truncate font-serif text-base font-semibold leading-tight">{pageLabel}</p>
          <p className="truncate text-xs leading-tight text-ink-700" title={current?.title}>
            {current ? (
              <>
                <span className="text-ink-700/60">Project: </span>
                <span className="font-medium">{current.title}</span>
              </>
            ) : (
              "No project selected"
            )}
          </p>
        </div>
      </header>

      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Menu">
          <button className="absolute inset-0 bg-black/40" aria-label="Close menu" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-4 overflow-y-auto bg-white p-4 shadow-xl">
            <div className="flex items-center justify-between">
              <Link href="/" className="font-serif text-lg font-semibold">
                Book Automation
              </Link>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-ink-100"
              >
                <X size={20} />
              </button>
            </div>
            <SidebarContent />
          </aside>
        </div>
      )}
    </div>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <ProjectProvider>
      <div className="flex min-h-screen flex-col md:flex-row">
        <MobileNav />
        <aside className="hidden w-64 shrink-0 flex-col gap-6 border-r border-ink-200 bg-white p-4 md:flex">
          <SidebarContent />
        </aside>
        <main className="min-w-0 flex-1 p-4 sm:p-6 md:p-10">{children}</main>
        <ServiceStatusBanner />
      </div>
    </ProjectProvider>
  );
}
