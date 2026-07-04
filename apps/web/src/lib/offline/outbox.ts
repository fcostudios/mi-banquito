import messages from "@/lib/i18n/en-US.json";

export type OutboxState = { queued: string[] };
export type OutboxEvent =
  | { type: "queued"; clientRequestId: string }
  | { type: "synced"; clientRequestId: string };

const copy = messages.offline;

export function offlineChipLabel(input: { status: "queued" | "synced" }): string {
  return input.status === "queued" ? copy.queued : "";
}

export function reduceOutboxState(state: OutboxState, event: OutboxEvent): OutboxState {
  if (event.type === "queued") {
    return state.queued.includes(event.clientRequestId)
      ? state
      : { queued: [...state.queued, event.clientRequestId] };
  }

  return { queued: state.queued.filter((id) => id !== event.clientRequestId) };
}

export function queuedCountLabel(count: number): string {
  return count === 1 ? copy.onePending : `${count} ${copy.manyPendingSuffix}`;
}
