import { existsSync, readFileSync } from "node:fs";

const sprint0Stories = [
  "US-001",
  "US-002",
  "US-003",
  "US-004",
  "US-005",
  "US-006",
  "US-007",
  "US-008",
  "US-009",
  "US-010",
  "US-011",
  "US-012",
  "US-013",
  "US-014",
  "US-015",
];

const feedbackPath = ".nous-feedback.jsonl";
if (!existsSync(feedbackPath)) {
  console.error("missing .nous-feedback.jsonl");
  process.exit(1);
}

const rawFeedback = readFileSync(feedbackPath, "utf8").trim();
const events = rawFeedback
  ? rawFeedback
      .split(/\n+/)
      .filter(Boolean)
      .map((line) => JSON.parse(line))
  : [];

let failed = false;
for (const story of sprint0Stories) {
  const storyEvents = events.filter((event) => event.story === story);
  const hasStarted = storyEvents.some((event) => event.event === "started");
  if (!hasStarted) {
    console.error(`${story}: missing started event`);
    failed = true;
  }

  const done = storyEvents.some((event) => event.event === "done");
  if (done) {
    const hasBuild = storyEvents.some((event) => event.event === "build_pass");
    const hasVerify = storyEvents.some((event) => event.event === "ac_verify" && event.pass === true);
    if (!hasBuild) {
      console.error(`${story}: done without build_pass`);
      failed = true;
    }
    if (!hasVerify) {
      console.error(`${story}: done without passing ac_verify`);
      failed = true;
    }
  }
}

if (failed) process.exit(1);
console.log("Sprint 0 AC audit passed");
