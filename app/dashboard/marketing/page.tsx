"use client";

import { CoverStudio } from "@/components/CoverStudio";
import { RequireProject } from "@/components/RequireProject";
import { SocialExporter } from "@/components/SocialExporter";
import { PageHeader } from "@/components/ui/kit";

export default function MarketingPage() {
  return (
    <div className="space-y-12">
      <RequireProject>
        {(p) => (
          <>
            <section>
              <PageHeader title="Cover Studio" subtitle="Generate cover concepts and promo images. Artwork is AI generated; your title and author are added on top." />
              <CoverStudio key={p.id} projectId={p.id} title={p.title} niche={p.niche} />
            </section>
            <section>
              <PageHeader
                title="Social Posts"
                subtitle="Turn a chapter into LinkedIn or X posts. Output is filtered for dashes, clichés and other AI tells."
              />
              <SocialExporter key={p.id} projectId={p.id} />
            </section>
          </>
        )}
      </RequireProject>
    </div>
  );
}
