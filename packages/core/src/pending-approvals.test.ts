import { describe, expect, it } from "vitest";
import { approvalInboxSummary, collectPendingApprovals } from "./pending-approvals.js";

const allowDeny = [
  { id: "allow", label: "Allow once" },
  { id: "always", label: "Always allow this tool" },
  { id: "deny", label: "Deny" },
];

describe("approvalInboxSummary", () => {
  it("strips the review-before prefix from executor copy", () => {
    expect(approvalInboxSummary('Review before writing "Q1" to reports', "destination.write")).toBe(
      'writing "Q1" to reports',
    );
  });

  it("falls back to the tool name when the card has no text", () => {
    expect(approvalInboxSummary("   ", "gmail_send_email")).toBe("gmail_send_email");
  });
});

describe("collectPendingApprovals", () => {
  const effect = {
    id: "effect-1",
    kind: "destination.write",
    createdAt: "2026-08-28T02:35:02.000Z",
    run: {
      id: "run-1",
      threadId: "thread-1",
      botId: "bot-1",
      botName: "Chief",
      groupId: null,
      groupName: null,
    },
  };

  it("binds an intended effect to its pending ask card", () => {
    expect(
      collectPendingApprovals(
        [effect],
        [
          {
            id: "msg-1",
            runId: "run-1",
            blocks: [
              {
                kind: "ask",
                approvalEffectId: "effect-1",
                text: 'Review before writing "Q1" to reports',
                detail: "collection: reports",
                status: "pending",
                actions: allowDeny,
              },
            ],
          },
        ],
      ),
    ).toEqual([
      {
        id: "effect-1",
        runId: "run-1",
        messageId: "msg-1",
        threadId: "thread-1",
        botId: "bot-1",
        botName: "Chief",
        groupId: null,
        groupName: null,
        summary: 'writing "Q1" to reports',
        detail: "collection: reports",
        toolName: "destination.write",
        highRisk: true,
        requestedAt: "2026-08-28T02:35:02.000Z",
      },
    ]);
  });

  it("skips answered cards, questions, and effects with no ask yet", () => {
    expect(
      collectPendingApprovals(
        [
          effect,
          { ...effect, id: "effect-2", kind: "remember" },
          {
            ...effect,
            id: "effect-3",
            kind: "gmail_send_email",
            run: { ...effect.run, id: "run-2" },
          },
        ],
        [
          {
            id: "answered",
            runId: "run-1",
            blocks: [
              {
                kind: "ask",
                approvalEffectId: "effect-1",
                text: "Review before writing to reports",
                status: "answered",
                answer: "allow",
                actions: allowDeny,
              },
            ],
          },
          {
            id: "question",
            runId: "run-1",
            blocks: [{ kind: "ask", text: "Which city?", status: "pending" }],
          },
        ],
      ),
    ).toEqual([]);
  });
});
