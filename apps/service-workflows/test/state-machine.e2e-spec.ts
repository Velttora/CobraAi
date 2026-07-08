import { describe, expect, it } from "vitest";
import {
  canTransition,
  listValidEvents,
  resolveTransition
} from "../src/state-machine/state-machine.service";

describe("state machine e2e", () => {
  it("flujo completo new → analyzing → active → contacted", () => {
    expect(resolveTransition("new", "DEBT_CREATED")).toBe("analyzing");
    expect(resolveTransition("analyzing", "DEBT_SEGMENTED")).toBe("active");
    expect(resolveTransition("active", "CONTACT_EFFECTIVE")).toBe("contacted");
  });

  it("flujo pago confirmed → paid_full", () => {
    expect(canTransition("active", "PAYMENT_CONFIRMED")).toBe(true);
    expect(resolveTransition("promised", "PAYMENT_CONFIRMED")).toBe("paid_full");
  });

  it("no permite eventos inválidos en estado terminal", () => {
    expect(listValidEvents("paid_full")).toEqual([]);
    expect(canTransition("paid_full", "CONTACT_EFFECTIVE")).toBe(false);
  });
});
