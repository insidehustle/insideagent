import Link from "next/link";
import { ArrowRight, BookOpenText, Compass, Image as ImageIcon, Megaphone, PenLine } from "lucide-react";

const steps = [
  { icon: Compass, title: "Ikigai Core", text: "Turn what you love, do well, and can sell into a living author blueprint." },
  { icon: BookOpenText, title: "Market Research", text: "Find the gaps top books in your niche leave open, from live web data or your own files." },
  { icon: PenLine, title: "Content Studio", text: "Outline and draft chapters in your voice,." },
  { icon: ImageIcon, title: "Cover Studio", text: "Generate cover concepts and promo images." },
  { icon: Megaphone, title: "Marketing", text: "Repurpose chapters into LinkedIn and X posts that do not read like AI." },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-20">
      <p className="text-sm font-medium uppercase tracking-widest text-accent">Book Automation System</p>
      <h1 className="mt-3 font-serif text-5xl leading-tight">From a premise to a published book, in your own voice.</h1>
      <p className="mt-5 max-w-2xl text-lg text-ink-700">
        Research what readers are missing, build a blueprint of who you are as an author, then draft, design, and market.
      </p>
      <Link
        href="/dashboard"
        className="mt-8 inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-3 font-medium text-white hover:bg-accent-dark"
      >
        Open dashboard <ArrowRight size={18} />
      </Link>
      <ul className="mt-16 grid gap-4 sm:grid-cols-2">
        {steps.map(({ icon: Icon, title, text }) => (
          <li key={title} className="rounded-xl border border-ink-200 bg-white p-5">
            <Icon className="text-accent" size={22} />
            <h2 className="mt-3 font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-ink-700">{text}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
