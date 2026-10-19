/** Content for the Tutorial page: the guided walkthrough and the feature guides. Plain data, so it is easy to edit. */

export interface WalkthroughStep {
  id: string;
  title: string;
  /** One line on why this step matters */
  why: string;
  actions: string[];
  tip?: string;
  href: string;
  linkLabel: string;
  /** Which project signal marks this step done automatically, if any */
  auto?: "project" | "blueprint" | "research" | "chapters";
}

export const WALKTHROUGH: WalkthroughStep[] = [
  {
    id: "project",
    title: "Create your project",
    why: "One project is one book. Its blueprint, research, chapters and snapshots all live inside it.",
    actions: [
      "Press New project in the sidebar.",
      "Enter the working title and the niche (who it is for and what it is about).",
      "Create it. Books default to non-fiction (the 7-step narrative framework). For a story, switch to Fiction later under Writing instructions in Content Studio.",
    ],
    tip: "Be specific with the niche. \"Time management for new mothers running a business\" researches far better than \"productivity\".",
    href: "/dashboard/projects/new",
    linkLabel: "New project",
    auto: "project",
  },
  {
    id: "blueprint",
    title: "Build your author blueprint (Ikigai Core)",
    why: "The blueprint is who you are as an author. It is injected into every chapter and post so the writing sounds like you and not like generic AI.",
    actions: [
      "Answer the four Ikigai questions: what you love, what you are good at, what the market needs, and what it will pay for.",
      "Add the optional detail: real stories, your ideal reader, a writing sample and what to avoid. The more you give, the better the voice match.",
      "Type each answer, or use the microphone on a field to dictate it.",
      "Press Generate blueprint, read it, and edit anything that is off, then press Save to keep your edits.",
      "Optional: save it as a reusable profile to apply to your next book.",
    ],
    tip: "Write the answers on paper first, then paste or dictate them. Longer, more personal answers give a far stronger voice.",
    href: "/dashboard/ikigai",
    linkLabel: "Open Ikigai Core",
    auto: "blueprint",
  },
  {
    id: "research",
    title: "Research the market",
    why: "Find where the top books in your niche fall short, so your book has a clear reason to exist.",
    actions: [
      "Open Research and press Run analysis for your niche. It reads top books and mines 1 to 3 star reviews for complaints.",
      "Read the outlier score (1 to 100) and the market gaps. Scores above 80 are strong opportunities; below 40 means crowded or unproven.",
      "Use YouTube references: press Find videos to get videos matched to your book brief and chapters. Press Add on any you want, and its transcript becomes a reference document.",
      "Optional: turn on auto-research to re-run the search on a schedule and see how the score changes.",
    ],
    tip: "Run research before you generate the outline. The market gaps feed straight into how the book is planned.",
    href: "/dashboard/research",
    linkLabel: "Open Research",
    auto: "research",
  },
  {
    id: "references",
    title: "Add reference material",
    why: "Anything you upload becomes source material the AI draws on, so the book reflects your knowledge and not guesses.",
    actions: [
      "In Content Studio, open Reference documents and upload PDFs, Word files or text, or paste a YouTube or article link.",
      "Use the toggle on each document to include or leave it out of the writing.",
      "Open Writing instructions and set standing rules: tone, things to avoid, how you want chapters to open. This is also where you switch between Non-fiction and Fiction.",
      "For fiction or named people, open Characters and let it detect them from your documents, then correct the list.",
    ],
    tip: "To write your own version of a book or video, pick it under \"Create my version of\" before generating the outline. It borrows the structure and ideas, never the wording.",
    href: "/dashboard/studio",
    linkLabel: "Open Content Studio",
  },
  {
    id: "outline",
    title: "Generate the outline and book brief",
    why: "The outline fixes the book's shape before any chapter is written. It also writes a brief for the whole book and for every chapter.",
    actions: [
      "In the Outline panel, set how many chapters you want (3 to 30).",
      "Press Generate outline.",
      "Read the book brief at the top and each chapter brief. Edit any brief to steer that chapter, then save it.",
    ],
    tip: "Changing your mind later? Delete all chapters and regenerate. A snapshot is saved first, so nothing is lost.",
    href: "/dashboard/studio",
    linkLabel: "Open Content Studio",
    auto: "chapters",
  },
  {
    id: "write",
    title: "Write the chapters",
    why: "Draft each chapter, then make it yours. Every draft continues from the previous chapter and follows your blueprint.",
    actions: [
      "Choose a chapter and press Draft chapter. Add a chapter instruction first if you want a particular angle or story.",
      "Edit in the text box. Your work autosaves a few seconds after you stop typing.",
      "Select a passage, describe the change, and press Rewrite selection to edit just that part with AI.",
      "Press Listen to hear the chapter read aloud, which is the fastest way to catch awkward sentences.",
      "Or press Write the book automatically to draft every chapter in order. Keep the tab open while it runs.",
    ],
    tip: "If the draft names someone who is not in your documents or Characters list, a yellow note flags it so you can add or remove them.",
    href: "/dashboard/studio",
    linkLabel: "Open Content Studio",
  },
  {
    id: "safety",
    title: "Protect your work: History and snapshots",
    why: "Redrafts and AI rewrites replace text. Versions and snapshots mean you can always go back.",
    actions: [
      "Press History on any chapter to see earlier versions, compare them with the current text, and restore one. Pin versions you never want pruned.",
      "A version is kept automatically before every redraft, AI rewrite and restore.",
      "Open Project snapshots in the sidebar and save a named milestone before big changes, such as \"First full draft\".",
      "Snapshots are also taken automatically before Autopilot and before deleting all chapters. Restore any of them from the same panel.",
    ],
    tip: "Restoring never destroys anything: the current text is saved first, so a restore can itself be undone.",
    href: "/dashboard/studio",
    linkLabel: "Open Content Studio",
  },
  {
    id: "manuscript",
    title: "Read the whole book",
    why: "See every written chapter in order as one manuscript.",
    actions: [
      "Open Manuscript to read the book from start to finish.",
      "Use Listen from here to hear the book from any point.",
      "Go back to Content Studio to fix anything you spot.",
    ],
    href: "/dashboard/manuscript",
    linkLabel: "Open Manuscript",
  },
  {
    id: "marketing",
    title: "Create the cover and promote the book",
    why: "A book needs a cover and an audience.",
    actions: [
      "In Marketing, use Cover Studio to generate cover concepts. The artwork is AI generated; your title and author name are added on top.",
      "Use Social Posts to turn a chapter into LinkedIn or X posts. The output is filtered for dashes, cliches and other AI giveaways.",
      "Post what you like, and edit the rest in your own words.",
    ],
    tip: "Repurpose your strongest chapters first. One chapter can produce several posts.",
    href: "/dashboard/marketing",
    linkLabel: "Open Marketing",
  },
];

export interface GuideSection {
  id: string;
  title: string;
  summary: string;
  href: string;
  items: { heading: string; body: string }[];
}

export const GUIDES: GuideSection[] = [
  {
    id: "ikigai",
    title: "Ikigai Core",
    summary: "Your author blueprint: who you are, who you write for and how you sound.",
    href: "/dashboard/ikigai",
    items: [
      { heading: "The four questions", body: "What you love, what you are good at, what the world needs, and what it will pay for. A book works best where all four overlap, which is the point of the framework." },
      { heading: "Optional detail", body: "Stories from your life, your ideal reader, a sample of your writing and things to avoid. These are what make the voice sound like you." },
      { heading: "Editing the blueprint", body: "The generated blueprint is a document you can edit. Changes are saved and used for everything written afterwards. Update it whenever your thinking changes." },
      { heading: "Profiles", body: "Save your answers and blueprint as a named profile and apply it to any other project, so you do not start from zero on the next book." },
      { heading: "Voice rules", body: "Rules listed under a Voice Rules heading in the blueprint are pulled out and applied to the writing. Add your own there." },
    ],
  },
  {
    id: "research",
    title: "Research",
    summary: "Market gaps, an outlier score and video references.",
    href: "/dashboard/research",
    items: [
      { heading: "Outlier score", body: "A 1 to 100 score built from five signals: how underserved the reader's pain is, buyer demand, how weak the top competitors are, how well you fit the gaps, and how well the niche earns beyond book sales. 80+ is a strong opportunity." },
      { heading: "Market gaps and competitors", body: "A list of what readers say top books get wrong, with each competitor's positioning and weakness. Use this to decide what your book does differently." },
      { heading: "YouTube references", body: "Searches YouTube for videos related to your book, using your title, niche, book brief, writing instructions and chapter plans. Add a focus phrase to steer it. Press Add to save a video's transcript as a reference document." },
      { heading: "Limits of video results", body: "Results are ranked by relevance, not view counts. Some videos have no captions and cannot be imported; the others are unaffected." },
      { heading: "Auto-research", body: "Turn it on to re-run the search on a schedule and compare the new score with the last one. It needs the server's scheduled job configured." },
    ],
  },
  {
    id: "studio",
    title: "Content Studio",
    summary: "Outline, draft, edit and protect the book.",
    href: "/dashboard/studio",
    items: [
      { heading: "Outline", body: "Generates the chapter list, a book brief and a brief for every chapter from your documents, instructions, characters and blueprint. If chapters are already drafted, delete them before regenerating." },
      { heading: "Briefs and instructions", body: "The chapter brief steers each draft; edit it freely. A chapter instruction is saved and followed every time that chapter is drafted. Writing instructions apply to the whole book." },
      { heading: "Reference documents", body: "Upload files or import links. Only documents switched on are used. The editor shows which ones a draft drew on." },
      { heading: "Characters", body: "Detected from your documents and drafts, or added by hand, then included in every writing prompt to keep names and roles consistent." },
      { heading: "Draft, redraft, rewrite selection", body: "Draft writes the chapter. Redraft replaces it (the old text is kept in History). Select text and describe a change to rewrite only that part." },
      { heading: "Listen", body: "Reads the chapter aloud. Useful for catching clumsy phrasing; changes can be applied back to the chapter." },
      { heading: "Write the whole book", body: "Autopilot detects characters, builds the outline if there is none, then drafts every chapter in order. You can stop it and resume later. On free-tier AI limits, expect pauses between chapters." },
      { heading: "Autosave", body: "Text saves a few seconds after you stop typing. The header shows Unsaved changes or the time of the last save. You are warned if you close the tab with unsaved text." },
      { heading: "History (chapter versions)", body: "Versions are kept before redrafts, AI rewrites, read-aloud edits and restores, and periodically while you edit. Compare any version with the current text: red is only in the old version, green is only in the current text. Restore, pin or name versions." },
      { heading: "Project snapshots", body: "A snapshot saves the brief, instructions, blueprint and every chapter. Save milestones yourself; they are also taken before Autopilot and before deleting all chapters. Restoring puts the whole book back." },
    ],
  },
  {
    id: "manuscript",
    title: "Manuscript",
    summary: "The whole book on one page.",
    href: "/dashboard/manuscript",
    items: [
      { heading: "Reading", body: "Every written chapter in order, so you can judge flow and pacing." },
      { heading: "Listening", body: "Start the read-aloud from any chapter." },
    ],
  },
  {
    id: "marketing",
    title: "Marketing",
    summary: "Covers and social posts.",
    href: "/dashboard/marketing",
    items: [
      { heading: "Cover Studio", body: "Generates cover concepts and promo images from your title and niche. The artwork is AI generated and your title and author name are added on top." },
      { heading: "Social Posts", body: "Turns a chapter into LinkedIn or X posts. Output is cleaned of dashes, hype words and other patterns that read as AI." },
    ],
  },
];

export const FAQ: { q: string; a: string }[] = [
  {
    q: "The AI does not sound like me. What do I change?",
    a: "Add more to the Ikigai optional fields, especially a real writing sample, stories and what to avoid. Then edit the blueprint's Voice Rules. Add standing rules under Writing instructions in Content Studio.",
  },
  {
    q: "I redrafted a chapter and liked the old one better.",
    a: "Open History on that chapter, select the version labelled Before redraft, and press Restore.",
  },
  {
    q: "I deleted all my chapters by mistake.",
    a: "Open Project snapshots in the Content Studio sidebar and restore the one labelled Before deleting chapters.",
  },
  {
    q: "Autopilot stopped part way through.",
    a: "Press the button again. It skips chapters that are already written and carries on. Rate limits on the AI provider cause pauses; the tab must stay open.",
  },
  {
    q: "A YouTube video would not import.",
    a: "The video probably has no captions available. Pick another video, or paste the transcript as a text document.",
  },
  {
    q: "Can I use the same author voice on another book?",
    a: "Yes. Save your Ikigai answers as a profile and apply it to the new project.",
  },
  {
    q: "Where do I see what the book was drawn from?",
    a: "After a draft, the line beside the Redraft button lists the reference documents used. Each chapter brief also shows what it was drawn from.",
  },
];
