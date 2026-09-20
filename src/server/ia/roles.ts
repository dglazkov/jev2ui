import type { Candidate } from "./decisions.js";
/** Responsibilities, not a product's feature list. Different subjects can instantiate a role later. */
export const WHOLE_CANDIDATES: Candidate[] = [
  ["collection", "Explore", "Find or choose among multiple subjects: records, people, places, messages, devices, content or offerings. This is not necessarily a media library."],
  ["detail", "Details", "Inspect one subject and its attributes, explanation or instructions. Subjects include a person, place, record, message, device, event or piece of content."],
  ["select", "Choose", "Choose a value, resource, location, time or subset in the current task, including spatial and custom-canvas selection. Selection alone is not a purchase or submission."],
  ["operate", "Workspace", "Perform an ongoing activity or directly operate an instrument, canvas, device or content: interact, adjust, start, pause or reset. This is not limited to playback."],
  ["monitor", "Status", "Observe current state, live position, measurements, progress, diagnostics or aggregate health, with appropriate inspection or control entry points."],
  ["history", "History", "Inspect past events, records, measurements or time periods. A past transaction is a record to inspect, not content to play."],
  ["edit", "Edit", "Enter or revise a draft, parameters, application, message or domain record. Saving preferences does not imply creating a new domain object."],
  ["review", "Review", "Inspect the consequences or summary of a pending commit, approval, deletion, booking or transaction before explicitly confirming or cancelling."],
  ["outcome", "Result", "Understand the result of a completed task, including a receipt, confirmation or feedback. Do not show a completed result before the task is committed."],
  ["conversation", "Conversation", "Read and exchange messages or replies in one conversation or collaboration thread."],
  ["preferences", "Preferences", "Configure the app or the current subject's behavior and options. Preferences are distinct from profiles, transactions and primary working screens."],
  ["help", "Help", "Read supporting instructions, troubleshooting or assistance for the primary task. Help is optional unless that is the requested task."],
].map(([id, label, purpose]) => ({ id: `w_${id}`, label, purpose, link: null }));
