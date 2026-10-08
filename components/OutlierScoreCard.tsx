"use client";

import { motion } from "framer-motion";
import { scoreLabel, WEIGHTS, type Competitor, type OutlierSubscores } from "@/lib/frameworks/outlier-evaluator";
import { cn } from "@/lib/cn";
import { Card, Markdown } from "./ui/kit";

export interface OutlierReportView {
  id: string;
  source: string;
  score: number;
  marketGaps: string[];
  competitorsJson: {
    competitors?: Competitor[];
    subscores?: OutlierSubscores;
    change?: { previousScore: number; delta: number; newCompetitors: string[] } | null;
  } | null;
  strategyMarkdown: string | null;
  createdAt: string;
}

const SUB_LABELS: Record<keyof OutlierSubscores, string> = {
  gapSeverity: "Gap severity",
  demandSignal: "Demand signal",
  competitorWeakness: "Competitor weakness",
  authorFit: "Author fit",
  monetizationPotential: "Monetization",
};

export function OutlierScoreCard({ report }: { report: OutlierReportView }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const competitors = report.competitorsJson?.competitors ?? [];
  const subscores = report.competitorsJson?.subscores;
  const change = report.competitorsJson?.change;

  return (
    <div className="space-y-4">
      <Card className="flex flex-col items-center gap-6 sm:flex-row">
        <div className="relative h-32 w-32 shrink-0">
          <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" role="img" aria-label={`Outlier score ${report.score} out of 100`}>
            <circle cx="60" cy="60" r={radius} fill="none" strokeWidth="10" className="stroke-ink-100" />
            <motion.circle
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              strokeWidth="10"
              strokeLinecap="round"
              className="stroke-accent"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset: circumference * (1 - report.score / 100) }}
              transition={{ duration: 0.9, ease: "easeOut" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-semibold">{report.score}</span>
            <span className="text-xs text-ink-700">/ 100</span>
          </div>
        </div>
        <div className="w-full">
          <h2 className="font-semibold">{scoreLabel(report.score)}</h2>
          <p className="mb-3 text-xs text-ink-700">
            Source: {report.source} · {new Date(report.createdAt).toLocaleString()}
          </p>
          {change && (
            <p className="mb-3 text-xs">
              <span className={cn("font-semibold", change.delta > 0 ? "text-green-700" : change.delta < 0 ? "text-red-700" : "")}>
                {change.delta === 0 ? "No change" : `${change.delta > 0 ? "+" : ""}${change.delta}`} since last run ({change.previousScore})
              </span>
              {change.newCompetitors.length > 0 && <> · New competitors: {change.newCompetitors.join(", ")}</>}
            </p>
          )}
          {subscores && (
            <ul className="space-y-1.5">
              {(Object.keys(WEIGHTS) as (keyof OutlierSubscores)[]).map((k) => (
                <li key={k} className="flex items-center gap-2 text-xs">
                  <span className="w-36 shrink-0">{SUB_LABELS[k]}</span>
                  <span className="h-1.5 flex-1 rounded bg-ink-100">
                    <span className="block h-full rounded bg-accent" style={{ width: `${Math.min(100, Math.max(0, subscores[k]))}%` }} />
                  </span>
                  <span className="w-7 text-right tabular-nums">{subscores[k]}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {report.marketGaps.length > 0 && (
        <Card>
          <h3 className="mb-2 font-semibold">Market gaps</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {report.marketGaps.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </Card>
      )}

      {competitors.length > 0 && (
        <Card>
          <h3 className="mb-3 font-semibold">Top competitors</h3>
          <ul className="space-y-3">
            {competitors.map((c) => (
              <li key={c.title} className="text-sm">
                <p className="font-medium">
                  {c.sourceUrl ? (
                    <a href={c.sourceUrl} target="_blank" rel="noreferrer" className="text-accent underline">
                      {c.title}
                    </a>
                  ) : (
                    c.title
                  )}
                  {c.author && <span className="font-normal text-ink-700"> by {c.author}</span>}
                </p>
                <p className="text-ink-700">{c.positioning}</p>
                <p>
                  <span className="font-medium">Weakness:</span> {c.weakness}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {report.strategyMarkdown && (
        <Card>
          <h3 className="mb-2 font-semibold">Market Gap Strategy Report</h3>
          <Markdown>{report.strategyMarkdown}</Markdown>
        </Card>
      )}
    </div>
  );
}
