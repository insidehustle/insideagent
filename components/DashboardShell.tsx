"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpenText, BookText, Compass, Image as ImageIcon, LayoutDashboard, Megaphone, PenLine, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { ProjectProvider, useProject } from "./ProjectProvider";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/ikigai", label: "Ikigai Core", icon: Compass },
  { href: "/dashboard/research", label: "Research", icon: BookOpenText },
  { href: "/dashboard/studio", label: "Content Studio", icon: PenLine },
  { href: "/dashboard/manuscript", label: "Manuscript", icon: BookText },
  { href: "/dashboard/marketing", label: "Marketing", icon: Megaphone },
];

function Sidebar() {
  const pathname = usePathname();
  const { projects, current, select } = useProject();
  return (
    <aside className="flex w-full shrink-0 flex-col gap-6 border-b border-ink-200 bg-white p-4 md:w-64 md:border-b-0 md:border-r">
      <Link href="/" className="font-serif text-lg font-semibold">
        Book Automation
      </Link>
      <Link
        href="/dashboard/projects/new"
        className={cn(
          "flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium",
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
      <nav className="flex gap-1 overflow-x-auto md:flex-col">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm",
                active ? "bg-accent-soft font-medium text-accent-dark" : "text-ink-700 hover:bg-ink-100",
              )}
            >
              <Icon size={16} />
              {label}
            </Link>
          );
        })}
      </nav>
      <p className="mt-auto hidden items-center gap-2 text-xs text-ink-700/60 md:flex">
        <ImageIcon size={12} /> Cover Studio lives in Marketing
      </p>
    </aside>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <ProjectProvider>
      <div className="flex min-h-screen flex-col md:flex-row">
        <Sidebar />
        <main className="min-w-0 flex-1 p-6 md:p-10">{children}</main>
      </div>
    </ProjectProvider>
  );
}
