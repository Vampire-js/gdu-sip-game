/**
 * Input aggregator: keyboard + on-screen touch buttons feed into a single
 * "virtual key" set, which is then reduced to an analogue-ish input state
 * (throttle, steer, brake, reset) each frame.
 */

export interface InputState {
  /** -1 (reverse) .. +1 (forward) */
  throttle: number;
  /** -1 (left) .. +1 (right) */
  steer: number;
  /** true while brake is held */
  brake: boolean;
}

type VirtualKey =
  | "forward"
  | "reverse"
  | "left"
  | "right"
  | "brake";

export class Input {
  readonly state: InputState = { throttle: 0, steer: 0, brake: false };

  private active = new Set<VirtualKey>();
  private resetRequested = false;

  constructor() {
    window.addEventListener("keydown", this.onKeyDown, { passive: false });
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", () => this.active.clear());

    this.setupTouchControls();
  }

  /** Call once per frame before reading state. */
  update(): void {
    let throttle = 0;
    let steer = 0;
    if (this.active.has("forward")) throttle += 1;
    if (this.active.has("reverse")) throttle -= 1;
    if (this.active.has("left")) steer -= 1;
    if (this.active.has("right")) steer += 1;
    this.state.throttle = throttle;
    this.state.steer = steer;
    this.state.brake = this.active.has("brake");
  }

  /** One-shot: returns true (and clears) if reset was requested since last call. */
  consumeReset(): boolean {
    const v = this.resetRequested;
    this.resetRequested = false;
    return v;
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    const key = this.mapKey(e.key);
    if (key) {
      this.active.add(key);
      e.preventDefault();
      return;
    }
    if (e.key === "r" || e.key === "R") {
      this.resetRequested = true;
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    const key = this.mapKey(e.key);
    if (key) this.active.delete(key);
  };

  private mapKey(k: string): VirtualKey | null {
    switch (k.toLowerCase()) {
      case "w":
      case "arrowup":
        return "forward";
      case "s":
      case "arrowdown":
        return "reverse";
      case "a":
      case "arrowleft":
        return "left";
      case "d":
      case "arrowright":
        return "right";
      case " ":
      case "shift":
        return "brake";
      default:
        return null;
    }
  }

  private setupTouchControls(): void {
    // Only build the DOM on devices with a coarse pointer (touch). Desktops
    // still get keyboard even if the DOM would have been built.
    const isTouch =
      typeof window.matchMedia === "function" &&
      (window.matchMedia("(pointer: coarse)").matches ||
        "ontouchstart" in window);
    if (!isTouch) return;

    const container = document.createElement("div");
    container.className = "touch-controls";
    container.innerHTML = `
      <div class="pad left">
        <button type="button" data-vkey="left" aria-label="Steer left">&#9664;</button>
        <button type="button" data-vkey="right" aria-label="Steer right">&#9654;</button>
      </div>
      <div class="pad right">
        <button type="button" data-vkey="reverse" aria-label="Reverse">&#9660;</button>
        <button type="button" data-vkey="forward" aria-label="Accelerate">&#9650;</button>
      </div>
    `;
    document.body.appendChild(container);

    const buttons = container.querySelectorAll<HTMLButtonElement>("button[data-vkey]");
    buttons.forEach((btn) => this.wireTouchButton(btn));
  }

  private wireTouchButton(btn: HTMLButtonElement): void {
    const vkey = btn.dataset.vkey as VirtualKey | undefined;
    if (!vkey) return;

    const press = (e: PointerEvent) => {
      e.preventDefault();
      btn.setPointerCapture(e.pointerId);
      btn.classList.add("active");
      this.active.add(vkey);
    };
    const release = (e: PointerEvent) => {
      e.preventDefault();
      if (btn.hasPointerCapture(e.pointerId)) {
        btn.releasePointerCapture(e.pointerId);
      }
      btn.classList.remove("active");
      this.active.delete(vkey);
    };

    btn.addEventListener("pointerdown", press);
    btn.addEventListener("pointerup", release);
    btn.addEventListener("pointercancel", release);
    // If the finger drifts off the button, treat as release so we never latch.
    btn.addEventListener("pointerleave", (e) => {
      if (btn.classList.contains("active")) release(e);
    });
    // Prevent the browser turning long-press into a context menu on iOS.
    btn.addEventListener("contextmenu", (e) => e.preventDefault());
  }
}
