import "./start-screen.css";

export class StartScreen {
  private readonly element = document.createElement("section");
  private readonly button = document.createElement("button");

  constructor(config: { title: string; playLabel: string }) {
    document.body.classList.add("before-play");
    this.element.className = "start-screen";
    this.element.setAttribute("aria-labelledby", "start-title");
    const title = document.createElement("h1");
    title.id = "start-title";
    title.textContent = config.title;
    this.button.type = "button";
    this.button.textContent = config.playLabel;
    this.button.disabled = true;
    this.element.setAttribute("aria-busy", "true");
    this.element.append(title, this.button);
    document.body.appendChild(this.element);
  }

  ready(onPlay: () => void): void {
    this.element.setAttribute("aria-busy", "false");
    this.button.disabled = false;
    this.button.addEventListener("click", () => {
      this.button.disabled = true;
      onPlay();
      document.body.classList.remove("before-play");
      this.element.remove();
    }, { once: true });
    this.button.focus({ preventScroll: true });
  }
}