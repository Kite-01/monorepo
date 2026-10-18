export type CheckoutResult =
  | { status: "success"; transferId: string }
  | { status: "failed"; reason: string; transferId?: string }
  | { status: "closed" };

export type CheckoutOptions = {
  /** Where your Kite server runs, such as https://pay.example.com */
  baseUrl: string;
  /** A payment link your server created with @kite-01/sdk. */
  paymentLinkId: string;
  onReady?: () => void;
  onStatus?: (event: { transferId: string; status: string }) => void;
  /**
   * The payment settled. Confirm it on your server, from a webhook or by
   * reading the transfer, before giving anything away.
   */
  onSuccess?: (event: { transferId: string }) => void;
  onFailed?: (event: { reason: string; transferId?: string }) => void;
  onClose?: () => void;
};

export type Checkout = {
  /** Settles once checkout closes, with how it ended. */
  result: Promise<CheckoutResult>;
  close: () => void;
};

type Message =
  | { type: "ready" }
  | { type: "status"; transferId: string; status: string }
  | { type: "success"; transferId: string }
  | { type: "failed"; reason: string; transferId?: string }
  | { type: "close" };

const css = `
.kite-checkout{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(17,17,17,.5)}
.kite-checkout iframe{width:min(1080px,calc(100% - 48px));height:min(800px,calc(100% - 48px));border:0;border-radius:20px;background:#f5f5f5;box-shadow:0 24px 64px rgba(0,0,0,.25)}
@media (max-width:640px){.kite-checkout iframe{width:100%;height:100%;border-radius:0}}
`;

const injectStyle = () => {
  if (document.getElementById("kite-checkout-style")) return;

  const style = document.createElement("style");
  style.id = "kite-checkout-style";
  style.textContent = css;
  document.head.append(style);
};

let open: Checkout | null = null;

export const openCheckout = (options: CheckoutOptions): Checkout => {
  open?.close();

  const base = options.baseUrl.replace(/\/+$/, "");
  const origin = new URL(base).origin;

  injectStyle();

  const overlay = document.createElement("div");
  overlay.className = "kite-checkout";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");

  const frame = document.createElement("iframe");
  frame.title = "Kite checkout";
  frame.allow = "clipboard-write";
  frame.src = `${base}/pay/${encodeURIComponent(options.paymentLinkId)}?embed=1`;
  overlay.append(frame);

  const overflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = "hidden";
  document.body.append(overlay);
  frame.focus();

  let outcome: CheckoutResult = { status: "closed" };
  let settle: (result: CheckoutResult) => void;
  const result = new Promise<CheckoutResult>((resolve) => {
    settle = resolve;
  });

  const onMessage = (event: MessageEvent) => {
    if (event.origin !== origin || event.source !== frame.contentWindow) return;

    const message = event.data as (Message & { source?: unknown }) | null;
    if (message?.source !== "kite") return;

    switch (message.type) {
      case "ready":
        options.onReady?.();
        break;
      case "status":
        options.onStatus?.({
          transferId: message.transferId,
          status: message.status,
        });
        break;
      case "success":
        outcome = { status: "success", transferId: message.transferId };
        options.onSuccess?.({ transferId: message.transferId });
        break;
      case "failed":
        if (outcome.status !== "success") {
          outcome = {
            status: "failed",
            reason: message.reason,
            transferId: message.transferId,
          };
        }
        options.onFailed?.({
          reason: message.reason,
          transferId: message.transferId,
        });
        break;
      case "close":
        close();
        break;
    }
  };

  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") close();
  };

  const close = () => {
    if (open !== checkout) return;
    open = null;

    window.removeEventListener("message", onMessage);
    window.removeEventListener("keydown", onKey);
    overlay.remove();
    document.documentElement.style.overflow = overflow;

    options.onClose?.();
    settle(outcome);
  };

  window.addEventListener("message", onMessage);
  window.addEventListener("keydown", onKey);

  const checkout: Checkout = { result, close };
  open = checkout;
  return checkout;
};
