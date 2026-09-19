// A picture that is never a hole. Until a source has loaded, the frame is
// painted from the design's palette with a symbol of what the picture will be
// of; a source that fails leaves that in place. Sources can improve while the
// screen is up (a stock photograph first, a generated one later), so each new
// one loads out of sight and fades in over the last.

import { LitElement, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";

@customElement("kit-picture")
export class KitPicture extends LitElement {
  @property() src?: string;
  @property() alt = "";
  @property() icon = "image";
  /** Sources that have loaded, oldest first. The last is the one on show; one before it is only there to be faded over. */
  @state() private loaded: string[] = [];
  @state() private failed?: string;

  protected createRenderRoot() {
    return this;
  }

  private arrived(url: string) {
    if (!this.loaded.includes(url)) this.loaded = [...this.loaded.slice(-1), url];
  }

  /** Once the new picture covers the old one, the old one goes: two blended layers would darken each other. */
  private settled(url: string) {
    if (this.loaded.at(-1) === url && this.loaded.length > 1) this.loaded = [url];
  }

  render() {
    const pending = this.src && this.src !== this.failed && !this.loaded.includes(this.src) ? [this.src] : [];
    // The host's classes belong to whoever placed it; its own state goes in an attribute.
    this.dataset.state = this.loaded.length ? "pictured" : this.src && this.src === this.failed ? "bare" : "waiting";
    return html`${this.loaded.length ? nothing : html`<span class="k-picture-stand material-symbols-outlined" aria-hidden="true">${this.icon}</span>`}
    ${repeat(
      [...this.loaded, ...pending],
      (url) => url,
      (url) =>
        html`<img
          class=${this.loaded.includes(url) ? "k-in" : ""}
          src=${url}
          alt=${this.alt}
          @load=${() => this.arrived(url)}
          @error=${() => (this.failed = url)}
          @transitionend=${() => this.settled(url)}
        />`,
    )}`;
  }
}
