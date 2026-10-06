"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, post } from "@/lib/client";

export interface ProjectSummary {
  id: string;
  title: string;
  niche: string;
  status: string;
  writingInstructions: string;
  kind: string;
  bookBrief: string;
  blueprint: { id: string } | null;
  _count: { chapters: number; outlierReports: number };
}

interface Ctx {
  projects: ProjectSummary[];
  current: ProjectSummary | null;
  loading: boolean;
  error: string | null;
  select: (id: string) => void;
  refresh: () => Promise<void>;
  create: (title: string, niche: string) => Promise<void>;
}

const ProjectContext = createContext<Ctx | null>(null);
const STORAGE_KEY = "bas.currentProject";

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const { projects } = await api<{ projects: ProjectSummary[] }>("/api/projects");
      setProjects(projects);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    try {
      setCurrentId(localStorage.getItem(STORAGE_KEY));
    } catch {
      // storage unavailable
    }
    void refresh();
  }, [refresh]);

  const select = useCallback((id: string) => {
    setCurrentId(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // storage unavailable
    }
  }, []);

  const create = useCallback(
    async (title: string, niche: string) => {
      const { project } = await post<{ project: { id: string } }>("/api/projects", { title, niche });
      await refresh();
      select(project.id);
    },
    [refresh, select],
  );

  const current = useMemo(
    () => projects.find((p) => p.id === currentId) ?? projects[0] ?? null,
    [projects, currentId],
  );

  const value = useMemo(
    () => ({ projects, current, loading, error, select, refresh, create }),
    [projects, current, loading, error, select, refresh, create],
  );
  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used inside ProjectProvider");
  return ctx;
}
