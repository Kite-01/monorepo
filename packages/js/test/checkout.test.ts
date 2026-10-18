import { afterEach, describe, expect, it, vi } from "vitest";
import { openCheckout } from "../src";

const BASE = "https://pay.example.com";
const LINK = "11111111-2222-3333-4444-555555555555";

const frame = () =>
  document.querySelector<HTMLIFrameElement>(".kite-checkout iframe");

const post = (
  data: Record<string, unknown>,
  { origin = BASE, source = frame()?.contentWindow } = {},
) => {
  window.dispatchEvent(
    new MessageEvent("message", {
      data: { source: "kite", ...data },
      origin,
      source: source ?? null,
    }),
  );
};

afterEach(() => {
  document.body.innerHTML = "";
  document.documentElement.style.overflow = "";
});

describe("openCheckout", () => {
  it("frames the payment link's embedded page and locks scrolling", () => {
    openCheckout({ baseUrl: `${BASE}/`, paymentLinkId: LINK });

    expect(frame()?.src).toBe(`${BASE}/pay/${LINK}?embed=1`);
    expect(frame()?.allow).toBe("clipboard-write");
    expect(document.documentElement.style.overflow).toBe("hidden");
  });

  it("reports progress and resolves with the outcome once closed", async () => {
    const onStatus = vi.fn();
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    const checkout = openCheckout({
      baseUrl: BASE,
      paymentLinkId: LINK,
      onStatus,
      onSuccess,
      onClose,
    });

    post({ type: "status", transferId: "tr1", status: "AwaitingDeposit" });
    post({ type: "success", transferId: "tr1" });
    post({ type: "close" });

    expect(onStatus).toHaveBeenCalledWith({
      transferId: "tr1",
      status: "AwaitingDeposit",
    });
    expect(onSuccess).toHaveBeenCalledWith({ transferId: "tr1" });
    expect(onClose).toHaveBeenCalledOnce();
    await expect(checkout.result).resolves.toEqual({
      status: "success",
      transferId: "tr1",
    });
    expect(frame()).toBeNull();
    expect(document.documentElement.style.overflow).toBe("");
  });

  it("ignores messages from other origins and other windows", () => {
    const onSuccess = vi.fn();
    openCheckout({ baseUrl: BASE, paymentLinkId: LINK, onSuccess });

    post(
      { type: "success", transferId: "tr1" },
      { origin: "https://evil.example" },
    );
    post({ type: "success", transferId: "tr1" }, { source: window });

    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("resolves as failed or closed when it did not succeed", async () => {
    const failed = openCheckout({ baseUrl: BASE, paymentLinkId: LINK });
    post({ type: "failed", reason: "expired", transferId: "tr1" });
    failed.close();

    await expect(failed.result).resolves.toEqual({
      status: "failed",
      reason: "expired",
      transferId: "tr1",
    });

    const closed = openCheckout({ baseUrl: BASE, paymentLinkId: LINK });
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    await expect(closed.result).resolves.toEqual({ status: "closed" });
  });

  it("keeps one checkout open at a time", async () => {
    const first = openCheckout({ baseUrl: BASE, paymentLinkId: LINK });
    openCheckout({ baseUrl: BASE, paymentLinkId: LINK });

    await expect(first.result).resolves.toEqual({ status: "closed" });
    expect(document.querySelectorAll(".kite-checkout")).toHaveLength(1);
  });
});
