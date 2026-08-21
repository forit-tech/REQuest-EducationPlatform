# REQuest Interface System

## Direction

REQuest is a Russian-language practical career training station, not a conventional course catalog. The interface should feel like a focused scientific workstation aboard a near-future research vessel: technical, calm, and readable for long sessions.

Core domain language: professions, campaigns, cases, episodes, characters, evidence, skill network, execution node, telemetry, REQuest ID, XP energy, production incidents. Rooms may remain an internal content grouping, but must not interrupt the active story.

The primary hierarchy is **Career domain → Profession/specialization → Campaign → Case → Episode**. The first choice must separate genuinely different fields (Data & AI, Backend, Frontend, DevOps, Cybersecurity); adjacent roles belong on the second level. Data Scientist is the first complete profession, never the entire identity of the platform.

The signature pattern is a **continuous playable case**: character scene → concrete objective → workstation action → consequence → next scene. The learner resumes the current episode immediately and never has to return to a room list between missions.

## Themes

Both themes share layout, typography, spacing, states, and accessibility.

- **Blue Future**: deep navy canvas, cold-blue surfaces, blue/cyan signal. Feels like a data observatory and ML workstation.
- **Hacker Terminal**: near-black canvas, graphite surfaces, phosphor-green signal with amber warnings. Feels like a secure terminal network, without RGB gaming or excessive Matrix decoration.

Color must communicate action or state. Decorative glow stays quiet.

## Depth strategy

Use borders and small surface-lightness shifts as the primary depth strategy. A subtle theme-colored glow is allowed only for hover, focus, current mission, or active network nodes. No large drop shadows and no broad glassmorphism.

Elevation:

1. `canvas` — application background.
2. `deck` — cards and large grouped regions.
3. `panel` — sticky detail panels, popovers, dialogs.
4. `inset` — inputs, terminal, editor, code blocks.

## Spacing and shape

- Base spacing unit: 4 px.
- Micro: 4–8 px.
- Component interior: 12–20 px.
- Section separation: 28–48 px.
- Controls: 10 px radius.
- Cards/panels: 14 px radius.
- Modals: 18 px radius.
- Avoid pill shapes except compact status/XP indicators.

## Typography

- UI and reading: Manrope.
- Code, telemetry, IDs, small section labels, numeric progress: JetBrains Mono.
- No visible text may render below 14 px.
- Headings use tight tracking and weight, not size alone.
- Four text levels are mandatory: primary, secondary, tertiary, muted.

## Reusable patterns

- Continuous quest loop: the default authenticated destination resumes the current case. Completing an episode automatically advances story state and opens the next playable beat without a catalog or room transition.
- Persistent cast: the current guide and companion remain visible in the case workspace, while full-screen character scenes introduce objectives, conflict, choices, and consequences.
- Workstation inside fiction: lecture notes, datasets, code, quizzes, and checks are tools used by the characters to solve the case. They must not read as a detached LMS page.
- Rooms are metadata: room/course groupings may exist in curriculum and practice views, but never appear as required navigation during the active campaign.

- Primary button: theme signal fill, dark signal text, 42 px minimum height.
- Secondary button: transparent/panel surface with quiet border.
- Icon button: square control, 34–40 px.
- Card: deck surface, quiet border, theme activation on hover.
- Input: inset surface, explicit label, persistent validation space where needed.
- Status badge: compact mono label; color only for semantic state.
- Progress bar: inset track, signal fill, mono numeric label.
- Room card: index rail, taxonomy label, title, short production-oriented description, skill tags, mission count, progress, one action.
- Mission row: state marker, type icon, title/meta, XP, disclosure affordance.
- Profession skill tree: a vertical top-to-bottom route with numbered milestone nodes. Every stage branches into concrete learning-node cards and a separate stack rail, with explicit current/available/locked/planned state. Do not substitute a horizontal row of large stage cards.
- Route contract: profession hero, stage action, Home continuation, curriculum prerequisites, and room order must resolve through the same stage-to-room mapping. A visible chevron is always a real button; `Начать маршрут` opens the first promised stage, never a later subject.
- Career domain selector: five prominent soft-square cards for genuinely different fields; selecting a domain reveals only its related profession cards.
- Shared skill: one canonical learning node may belong to several profession routes. Completion propagates across every route that references it; never ask a learner to repeat Основы Python, SQL, Git, Linux, or another identical block.
- Technical footnote: first use a natural Russian term, then the original in parentheses when it helps recognition (for example, `переобучение (overfitting)`). Mission panels expose a quiet inset glossary note with a short practical definition.
- REQuest ID: avatar and identity first, then security, contacts, reminders, and learning telemetry.
- Primary navigation: every sidebar item opens a real application section, updates the header context, and exposes `aria-current`; never render a navigation-shaped button without a destination.
- Global search: the top-bar search control opens a focused command surface with real results for sections, professions, courses, and missions. Every result navigates to its destination; support `Ctrl/⌘ + /` to open, `Escape` and backdrop click to close, and never leave a search-shaped control inert.
- Section dashboard: a concise mission-oriented intro followed by domain-specific surfaces—current learning on Home, room drills in Practice, portfolio briefs in Projects, and progress milestones in Achievements.
- Domain curriculum tree: vertical numbered phases containing course nodes with goal, mission count, representative blocks, prerequisites, and ready/planned state. It is generated from `knowledge/<domain>/programs.json`, never duplicated in components.
- Mission detail panel: keep the selected mission in a viewport-bounded, independently scrollable panel with contained overscroll. Show `Начать миссию` directly under the mission identity and keep completion/progress controls sticky at the panel bottom.
- Mission runner: the active case keeps its cast, episode, objective, and narrative context visible around a full-window execution station. The workstation uses a sequential brief on the left, task workspace in the center, context-sensitive answer/check surface on the right, and verification telemetry below. Completion immediately continues the story.
- Runner accent discipline: use a 3–10% mix of the active `signal` token on the briefing identity, active file tab, data headers, task heading, terminal header, and verification footer. Pair these quiet fields with one solid signal edge; do not introduce decorative secondary hues.
- Mission pedagogy: theory and quiz missions open on a Russian lecture-note tab, connect the concept to a specific visible datum, and do not show a terminal. Terminal/editor surfaces appear only when a lab, code task, case, or boss mission requires inspection or execution, and the note must explain why that tool is needed.
- Investigation mission: when the learner must infer a concept from data, open on the dataset instead of the lecture. Keep the note locked until the learner collects explicit evidence (row, feature, value or equivalent), justifies the conclusion, and handles a second production dataset with changed granularity. The task rail shows completed evidence as a compact checklist; it must never state the inferred answer before verification.
- Theme scrollbar: use the active semantic `signal` color for the thumb and the inset `control` surface for the track; apply consistently to page and nested learning panels.

## States

All interactive elements require default, hover, active, focus-visible, and disabled states.

- Locked: low contrast, lock icon, no glow.
- Available: theme border and quiet hover activation.
- Current: stronger signal and restrained pulse/glow.
- Completed: teal/success signal and checkmark.
- Error: coral/red, with an actionable explanation.
- Success: teal/green, never color alone—pair with text/icon.

## Rules for future screens

- Navigation context is always visible.
- New screens consume semantic tokens; never add theme-specific hex values inside components.
- Long educational content is split into sequential mission steps.
- Monaco, terminal, charts, mission runner, and account surfaces use the same canvas/deck/panel/inset elevation model.
- Course content remains data-driven and separate from presentation.
- Course knowledge lives outside React in `knowledge/<domain>/<course>/course.json`; runtime components only render objectives, context, task, answer feedback, hints, glossary references, XP, and progress.
- Russian is the default language for every visible heading, learning block, explanation, and mission title. Keep original names only for technologies, libraries, commands, APIs, file formats, language constructs, and established abbreviations; explain unfamiliar terms at first use.
