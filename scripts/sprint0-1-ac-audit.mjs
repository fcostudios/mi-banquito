#!/usr/bin/env node
import { readdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const sprintDirectories = ["docs/stories/sprint-0", "docs/stories/sprint-1"];
const storyFiles = sprintDirectories.flatMap((directory) =>
  readdirSync(resolve(root, directory))
    .filter((file) => file.endsWith(".md"))
    .map((file) => join(directory, file)),
);
const events = readFileSync(resolve(root, ".nous-feedback.jsonl"), "utf8")
  .trim()
  .split(/\n+/)
  .filter(Boolean)
  .map((line) => JSON.parse(line));

let failed = false;
for (const storyFile of storyFiles) {
  const text = readFileSync(resolve(root, storyFile), "utf8");
  const story = text.match(/^# (US-\d+):/m)?.[1];
  if (!story) {
    console.error(`[sprint0-1] cannot read story id from ${basename(storyFile)}`);
    failed = true;
    continue;
  }

  const storyEvents = events.filter((event) => event.story === story);
  if (!storyEvents.some((event) => event.event === "started")) {
    console.error(`[sprint0-1] ${story}: missing started event`);
    failed = true;
  }

  if (!storyEvents.some((event) => event.event === "done")) continue;

  if (!storyEvents.some((event) => event.event === "build_pass")) {
    console.error(`[sprint0-1] ${story}: done without build_pass`);
    failed = true;
  }

  const acceptanceCriteria = [...text.matchAll(/^- \[ \] AC-(\d+)/gm)].map((match) => Number(match[1]));
  const verifiedCriteria = new Set(
    storyEvents
      .filter((event) => event.event === "ac_verify" && event.pass === true)
      .map((event) => Number(event.ac)),
  );
  const missingCriteria = acceptanceCriteria.filter((criterion) => !verifiedCriteria.has(criterion));
  if (missingCriteria.length > 0) {
    console.error(`[sprint0-1] ${story}: missing passing ac_verify for AC-${missingCriteria.join(", AC-")}`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log("[sprint0-1] lifecycle and per-AC evidence passed");
