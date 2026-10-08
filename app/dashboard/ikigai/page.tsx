"use client";

import { IkigaiForm } from "@/components/IkigaiForm";
import { RequireProject } from "@/components/RequireProject";
import { PageHeader } from "@/components/ui/kit";

export default function IkigaiPage() {
  return (
    <div>
      <PageHeader
        title="Ikigai Core"
        subtitle="Answer the four Ikigai questions, plus optional detail about your stories, reader and voice, by typing or dictating. The AI synthesizes your author blueprint, which guides every chapter and post. Save it as a profile to reuse on other books."
      />
      <RequireProject>{(p) => <IkigaiForm key={p.id} projectId={p.id} />}</RequireProject>
    </div>
  );
}
