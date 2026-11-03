/** Content for the Tutorial page: the guided walkthrough and the feature guides. Plain data, so it is easy to edit. */

export interface TutorialImage {
  src: string;
  /** Describes the screen for people who cannot see it. The book text in these pictures is blurred on purpose. */
  alt: string;
  caption?: string;
}

/** A screenshot saved under public/tutorial. */
const shot = (file: string, alt: string, caption?: string): TutorialImage => ({ src: `/tutorial/${file}.png`, alt, caption });

export interface WalkthroughStep {
  id: string;
  title: string;
  /** Screenshots of the screens this step uses */
  images?: TutorialImage[];
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
    images: [shot("new-project", "The New project form with a title and a niche field.", "The New project form.")],
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
    images: [shot("ikigai", "Ikigai Core: author profiles at the top, the four question boxes on the left and the generated blueprint on the right.", "Your answers on the left, the generated blueprint on the right.")],
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
    images: [shot("research", "The Research page: a niche box with Run analysis, a place to add a video or web page, an auto-research switch and an outlier score of 82 out of 100.", "Run analysis, then read the outlier score and market gaps.")],
  },
  {
    id: "references",
    title: "Add reference material",
    why: "Anything you upload becomes source material the AI draws on, so the book reflects your knowledge and not guesses.",
    actions: [
      "In Content Studio, open Reference documents and upload PDFs, Word files or text, or paste a YouTube or article link.",
      "Use the toggle on each document to include or leave it out of the writing.",
      "Open Writing instructions and set standing rules: tone, things to avoid, how you want chapters to open. This is also where you switch between Non-fiction and Fiction.",
      "Open Author interview and press Start interview. The AI asks one question at a time, based on your documents and instructions. Answer in your own words, skip any you like, then press Add answers to writing instructions.",
      "For fiction or named people, open Characters and let it detect them from your documents, then correct the list.",
    ],
    tip: "To write your own version of a book or video, pick it under \"Create my version of\" before generating the outline. It borrows the structure and ideas, never the wording. Specific stories, names and numbers in your interview answers are what make the book sound like you.",
    href: "/dashboard/studio",
    linkLabel: "Open Content Studio",
    images: [
      shot("studio-documents", "The Reference documents panel with an Upload files button, a link box and a list of three documents with checkboxes.", "Reference documents: switch each one on or off."),
      shot("studio-interview", "The Author interview panel with a Start interview button.", "Author interview: press Start interview."),
    ],
  },
  {
    id: "outline",
    title: "Generate the outline and book brief",
    why: "The outline fixes the book's shape before any chapter is written. It also writes a brief for the whole book and for every chapter.",
    actions: [
      "In the Outline panel, set how many chapters you want (3 to 30).",
      "Press Generate outline.",
      "Read the book brief at the top and each chapter brief. Edit any brief to steer that chapter, then save it.",
      "Open Progress at the top of Content Studio and set a word goal for the whole book (a standard book is about 50,000 words).",
    ],
    tip: "Changing your mind later? Delete all chapters and regenerate. A snapshot is saved first, so nothing is lost. Already have a finished manuscript and only want to edit it? Skip the outline and use Import my manuscript at the top of Content Studio: it splits your file into chapters without rewriting a word.",
    href: "/dashboard/studio",
    linkLabel: "Open Content Studio",
    auto: "chapters",
    images: [
      shot("studio-import", "The Import my manuscript panel with a Choose a file button and a paste option.", "Already have a book? Import it instead of generating an outline."),
      shot("studio-outline", "The Outline panel with a chapter count, a Create my version of selector and a Generate outline button.", "The Outline panel."),
    ],
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
      "Or press Write the book automatically to draft every chapter in order. It runs as a background job on the server, with progress, a Stop button and, if something blocks it, the reason and a Resume button.",
      "Not happy with the shape? Use the arrows beside a chapter in the list to move it, click in the text and press Split at cursor to cut a chapter in two, or press Merge with next to join two.",
    ],
    tip: "If the draft names someone who is not in your documents or Characters list, a yellow note flags it so you can add or remove them.",
    images: [shot("studio-editor", "The chapter editor in Content Studio, with Listen, History and Save buttons, the chapter brief, a box for chapter instructions with a Redraft button, the split and merge tools and the chapter text. The text is blurred.", "The chapter editor. The book text is blurred in this picture.")],
    href: "/dashboard/studio",
    linkLabel: "Open Content Studio",
  },
  {
    id: "check",
    title: "Check the whole book hangs together",
    why: "Problems that cross chapters, such as repeated wording, a dropped thread or a contradiction, are hard to see while you are writing one chapter at a time.",
    actions: [
      "Open Continuity check in the Content Studio sidebar and press Check the book.",
      "Read each finding. Exact matches (repeated phrases, same openings, odd lengths, unknown names) are reliable. Findings marked \"AI reading\" are suggestions, so verify them against the chapter.",
      "Press Open chapter on a finding to jump straight to it, fix it, and check again.",
      "Watch Progress for your word count against the goal and your daily streak.",
    ],
    tip: "Run the check after the first full draft and again before you call the book finished.",
    images: [shot("studio-continuity", "The Continuity check panel with a Check the book button.", "Press Check the book.")],
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
      "Use the chapter selector at the top, which stays in view as you scroll, to jump to any chapter. The arrows step to the previous or next one.",
      "Press Listen from here to hear the book from that chapter. Each chapter is announced by its number and title, and reading carries on into the next chapter by itself until you pause or untick Continue to the next chapter.",
      "Need the same change everywhere, such as a renamed character? Open Find and replace in the whole book, press Show matches, untick any chapter you want to leave alone, then Replace. The changes show up in Content Studio too.",
      "Go back to Content Studio to fix anything else you spot.",
    ],
    tip: "Find and replace saves a project snapshot and each chapter's earlier text in History first, so it can be undone.",
    images: [
      shot("manuscript", "The Manuscript page: a chapter selector bar with previous and next arrows and a Listen from here button, a Find and replace panel, and the first chapter. The book text is blurred.", "The chapter selector stays at the top as you scroll."),
      shot("manuscript-listen", "The read-aloud player with a pause button, speed and voice choices and a Continue to the next chapter checkbox. The book text is blurred.", "The listening player."),
      shot("manuscript-replace", "The Find and replace panel opened, with Find and Replace with boxes, Match case and Whole words only options and a Show matches button.", "Find and replace in the whole book."),
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
    images: [shot("marketing", "Marketing page with the Cover Studio form (title, subtitle, author name, layout and asset) and the start of Social Posts.", "Cover Studio and Social Posts.")],
    href: "/dashboard/marketing",
    linkLabel: "Open Marketing",
  },
];

export interface GuideSection {
  id: string;
  title: string;
  summary: string;
  images?: TutorialImage[];
  href: string;
  items: { heading: string; body: string }[];
}

export const GUIDES: GuideSection[] = [
  {
    id: "ikigai",
    title: "Ikigai Core",
    summary: "Your author blueprint: who you are, who you write for and how you sound.",
    images: [shot("ikigai", "Ikigai Core with the question boxes on the left and the blueprint on the right.")],
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
    images: [shot("research", "The Research page with Run analysis, add a video or web page, auto-research and the outlier score.")],
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
    images: [shot("studio-editor", "The Content Studio chapter editor with the book text blurred.")],
    href: "/dashboard/studio",
    items: [
      { heading: "Import my manuscript", body: "For authors who only want to edit, listen and run the continuity check. Choose a .docx, .pdf, .txt or .md file, or paste the text, and it is split into chapters with nothing rewritten. It looks for headings such as Chapter 1, Prologue, Part One, markdown # titles or numbered titles. If it finds none, it cuts the text into even sections that you can rename, split or merge. If the project already has chapters you choose to replace them (a snapshot is saved first) or add after them. Scanned PDFs need converting to text first." },
      { heading: "Author interview", body: "The AI interviews you, one question at a time, using your reference documents and writing instructions. It asks for your own stories, opinions, reader and voice, which documents cannot supply. Skip any question and stop whenever you like. Press Add answers to writing instructions and they are distilled into a marked section of your Writing instructions, which every outline, chapter and edit then follows. Running the interview again replaces that section and never touches what you typed yourself. An unfinished interview is remembered in your browser." },
      { heading: "Outline", body: "Generates the chapter list, a book brief and a brief for every chapter from your documents, instructions, characters and blueprint. If chapters are already drafted, delete them before regenerating." },
      { heading: "Briefs and instructions", body: "The chapter brief steers each draft; edit it freely. A chapter instruction is saved and followed every time that chapter is drafted. Writing instructions apply to the whole book." },
      { heading: "Reference documents", body: "Upload files or import links. Only documents switched on are used. The editor shows which ones a draft drew on." },
      { heading: "Characters", body: "Detected from your documents and drafts, or added by hand, then included in every writing prompt to keep names and roles consistent." },
      { heading: "Draft, redraft, rewrite selection", body: "Draft writes the chapter. Redraft replaces it (the old text is kept in History). Select text and describe a change to rewrite only that part." },
      { heading: "Listen", body: "Reads the chapter aloud. Useful for catching clumsy phrasing; changes can be applied back to the chapter." },
      { heading: "Write the whole book", body: "Starts a background job that detects characters, builds the outline if there is none, saves a snapshot, then drafts every chapter in order. The work is kept on the server, so closing the tab does not lose it. If the site is set up to continue by itself (see the README) it keeps going with the tab closed; otherwise progress happens while the tab is open and picks up again when you return. Short rate limits are waited out automatically. If the AI allowance is used up, a key is rejected or a chapter keeps failing, the job pauses and shows why; press Resume once it is fixed. Stop ends it and keeps every chapter already written. One book runs one job at a time, and each author can have two running." },
      { heading: "Progress, word goal and streak", body: "Set a word goal for the book and watch the bar fill as you write. Chapter lengths are shown as small bars (click one to open it). The streak counts consecutive days on which you edited or saved a chapter; it stays alive until the end of the following day." },
      { heading: "Moving, splitting and merging chapters", body: "Use the up and down arrows beside a chapter in the list to reorder it; the numbers update everywhere. To split, click in the text where the new chapter should begin, optionally name it, and press Split at cursor. Merge with next joins the chapter below into this one. A split keeps the original as a version, and a merge saves a project snapshot first because it removes a chapter." },
      { heading: "Continuity check", body: "Scans the drafted chapters for repeated wording, chapters that open the same way, very short or very long chapters and names missing from Characters. It also asks the AI to read each chapter's plan, opening and closing for contradictions, dropped threads and unkept promises. The AI part sees only those excerpts, so treat its findings as leads and confirm them. If the AI is unavailable the exact checks still run." },
      { heading: "Autosave", body: "Text saves a few seconds after you stop typing. The header shows Unsaved changes or the time of the last save. You are warned if you close the tab with unsaved text." },
      { heading: "History (chapter versions)", body: "Versions are kept before redrafts, AI rewrites, read-aloud edits and restores, and periodically while you edit. Compare any version with the current text: red is only in the old version, green is only in the current text. Restore, pin or name versions." },
      { heading: "Project snapshots", body: "A snapshot saves the brief, instructions, blueprint and every chapter. Save milestones yourself; they are also taken before Autopilot and before deleting all chapters. Restoring puts the whole book back." },
    ],
  },
  {
    id: "manuscript",
    title: "Manuscript",
    summary: "The whole book on one page.",
    images: [shot("manuscript", "The Manuscript page with the chapter selector bar and the book text blurred.")],
    href: "/dashboard/manuscript",
    items: [
      { heading: "Reading", body: "Every written chapter in order, so you can judge flow and pacing." },
      { heading: "Chapter selector", body: "A bar at the top of the page, always in view, with a dropdown of every chapter and previous and next arrows. Choose a chapter and the page scrolls to it. The dropdown follows you as you scroll." },
      { heading: "Listening", body: "Start the read-aloud from any chapter, or from any paragraph with its play button, or press Listen from here on the chapter selector. The chapter number and title are read first when a chapter starts from the top. Reading continues into the next chapter by itself; untick Continue to the next chapter in the player to stop at the end of each one. Speed and voice are remembered. Tap a word or paragraph in the player to revise it." },
      { heading: "Find and replace in the whole book", body: "Change a name, term or spelling in every chapter at once. Choose Match case or Whole words only, press Show matches to see each chapter with a highlighted example, untick any chapter to leave it out, then press Replace. Chapter titles are included. A project snapshot is saved first and each changed chapter keeps its earlier text in History (labelled Before find and replace). It changes exact text only; it does not understand meaning, so check the matches before replacing." },
    ],
  },
  {
    id: "marketing",
    title: "Marketing",
    summary: "Covers and social posts.",
    images: [shot("marketing", "The Marketing page with the Cover Studio form.")],
    href: "/dashboard/marketing",
    items: [
      { heading: "Cover Studio", body: "Generates cover concepts and promo images from your title and niche. The artwork is AI generated and your title and author name are added on top." },
      { heading: "Social Posts", body: "Turns a chapter into LinkedIn or X posts. Output is cleaned of dashes, hype words and other patterns that read as AI." },
    ],
  },
];

export const FAQ: { q: string; a: string }[] = [
  {
    q: "Can I close the tab while the book is being written?",
    a: "Yes if the panel says it runs on the server. If it says to keep the tab open, the site is not yet set up to continue on its own, so progress happens only while the tab is open. Your place is saved either way, and the job carries on when you come back.",
  },
  {
    q: "I split a chapter in the wrong place.",
    a: "Open History on the first part: a version named Before split holds the whole original text. Restore it, then delete the extra chapter by merging, or restore the snapshot if you merged.",
  },
  {
    q: "The continuity check says something that is not true.",
    a: "Findings marked AI reading come from excerpts only (the plan, opening and closing of each chapter), so the middle of a chapter is not seen. Check the chapter and ignore the finding if it is wrong.",
  },
  {
    q: "My streak reset even though I wrote.",
    a: "Days are counted in your own time zone and only when a chapter is edited or saved. Autosave counts, but opening a chapter without changing it does not.",
  },
  {
    q: "The AI does not sound like me. What do I change?",
    a: "Add more to the Ikigai optional fields, especially a real writing sample, stories and what to avoid. Then edit the blueprint's Voice Rules. Add standing rules under Writing instructions in Content Studio.",
  },
  {
    q: "I redrafted a chapter and liked the old one better.",
    a: "Open History on that chapter, select the version labelled Before redraft, and press Restore.",
  },
  {
    q: "I only want to edit my own book, not have it rewritten.",
    a: "Use Import my manuscript at the top of Content Studio. It splits your file into chapters and leaves the words alone. Then edit, listen on the Manuscript page and run the continuity check. Skip the outline and the drafting buttons.",
  },
  {
    q: "My imported book was split in the wrong places.",
    a: "The split follows headings such as Chapter 1 or Prologue. If your file has none, it is cut into even sections. Rename any chapter, use Split at cursor and Merge with next to fix the breaks, or add clear headings to the file and import it again, choosing to replace the chapters (a snapshot is saved first).",
  },
  {
    q: "I replaced the wrong text across the book.",
    a: "Open History on an affected chapter and restore the version labelled Before find and replace, or restore the project snapshot of that name from Project snapshots to put every chapter back at once.",
  },
  {
    q: "I deleted all my chapters by mistake.",
    a: "Open Project snapshots in the Content Studio sidebar and restore the one labelled Before deleting chapters.",
  },
  {
    q: "The automatic writing stopped part way through.",
    a: "Open the Write the whole book panel. It shows whether the job is waiting (a rate limit that clears by itself, with a countdown) or paused (something needs you: an allowance used up, a key problem, or a chapter that keeps failing), and why. Press Resume or Try now once it is fixed; chapters already written are kept.",
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
