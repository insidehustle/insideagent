"use client";

import { OutlierSearchControls } from "@/components/OutlierSearchControls";
import { RequireProject } from "@/components/RequireProject";
import { PageHeader } from "@/components/ui/kit";
import { YoutubeReferences } from "@/components/YoutubeReferences";

export default function ResearchPage() {
  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Outlier Research"
        subtitle="Find where the top books in your niche fall short, and score how strong the opening is."
      />
      <RequireProject>
        {(p) => (
          <div className="space-y-6">
            <OutlierSearchControls key={p.id} projectId={p.id} defaultNiche={p.niche} />
            <YoutubeReferences key={`yt-${p.id}`} projectId={p.id} />
          </div>
        )}
      </RequireProject>
    </div>
  );
}
