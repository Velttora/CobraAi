import { describe, expect, it } from "vitest";
import {
  isNonCollectableForProactiveTrigger,
  isScheduleContactStatus,
  NON_COLLECTABLE_FOR_PROACTIVE_TRIGGERS,
  SCHEDULE_CONTACT_STATUSES
} from "./collectable-statuses";

describe("collectable-statuses", () => {
  it("schedule solo admite upcoming, active y contacted", () => {
    expect([...SCHEDULE_CONTACT_STATUSES]).toEqual([
      "upcoming",
      "active",
      "contacted"
    ]);
    expect(isScheduleContactStatus("active")).toBe(true);
    expect(isScheduleContactStatus("disputed")).toBe(false);
    expect(isScheduleContactStatus("paid_full")).toBe(false);
    expect(isScheduleContactStatus("written_off")).toBe(false);
  });

  it("proactive triggers bloquean disputadas, pagadas y legales", () => {
    expect(NON_COLLECTABLE_FOR_PROACTIVE_TRIGGERS).toContain("disputed");
    expect(NON_COLLECTABLE_FOR_PROACTIVE_TRIGGERS).toContain("paid_partial");
    expect(NON_COLLECTABLE_FOR_PROACTIVE_TRIGGERS).toContain("paid_full");
    expect(NON_COLLECTABLE_FOR_PROACTIVE_TRIGGERS).toContain("written_off");
    expect(isNonCollectableForProactiveTrigger("disputed")).toBe(true);
    expect(isNonCollectableForProactiveTrigger("active")).toBe(false);
    expect(isNonCollectableForProactiveTrigger("promised")).toBe(false);
  });
});
