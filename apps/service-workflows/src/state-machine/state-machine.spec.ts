import { describe, expect, it } from "vitest";
import {
  canTransition,
  listValidEvents,
  resolveTransition
} from "./state-machine.service";

describe("StateMachine", () => {
  it("transiciona new → analyzing con DEBT_CREATED", () => {
    expect(canTransition("new", "DEBT_CREATED")).toBe(true);
    expect(resolveTransition("new", "DEBT_CREATED")).toBe("analyzing");
  });

  it("transiciona analyzing → active con DEBT_SEGMENTED", () => {
    expect(resolveTransition("analyzing", "DEBT_SEGMENTED")).toBe("active");
  });

  it("transiciona promised → active con PROMISE_BROKEN", () => {
    expect(resolveTransition("promised", "PROMISE_BROKEN")).toBe("active");
  });

  it("rechaza transición inválida paid_full → active", () => {
    expect(canTransition("paid_full", "CONTACT_EFFECTIVE")).toBe(false);
    expect(listValidEvents("paid_full")).toEqual([]);
  });

  it("permite escalamiento legal desde legal_risk", () => {
    expect(resolveTransition("legal_risk", "ESCALATE_LEGAL")).toBe("legal");
  });
});
