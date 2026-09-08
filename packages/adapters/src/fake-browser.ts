import type {
  AdapterContext,
  AdapterDescriptor,
  BrowserActionResult,
  BrowserDriver,
  BrowserDriverCapabilities,
  BrowserSession,
  BrowserSnapshot,
} from "@rakazo/adapter-kit";
import { hashSnapshotTree } from "./browser-snapshot-util.js";

/** One control on a {@link FakePage}. `ref` is assigned by the session in element order. */
export interface FakeElement {
  role: "link" | "button" | "textbox" | "combobox";
  name: string;
  /** For a link: the URL `click` navigates to. */
  href?: string;
  /** For a combobox: the selectable option values. */
  options?: string[];
}

export interface FakePage {
  title: string;
  elements?: FakeElement[];
  /** Where `type(ref, text, { submit: true })` on a textbox sends the browser. */
  submitUrl?: string;
}

const BLANK_PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

const NOT_FOUND = "about:blank#not-found";

/**
 * A deterministic in-memory {@link BrowserDriver} for offline tests. Pages are keyed by URL;
 * navigation to an unknown URL lands on a blank not-found page. Every session records its
 * actions in `log` and the values typed into each textbox `ref`.
 */
export class FakeBrowserDriver implements BrowserDriver {
  constructor(private readonly pages: Record<string, FakePage> = {}) {}

  describe(): AdapterDescriptor<BrowserDriverCapabilities> {
    return {
      id: "fake-browser",
      contractVersion: "1",
      adapterVersion: "0.1.0",
      capabilities: { snapshot: true, screenshot: true, persistentProfile: true },
    };
  }

  async open(profileId: string, _context: AdapterContext): Promise<BrowserSession> {
    return new FakeBrowserSession(this.pages, profileId);
  }
}

export class FakeBrowserSession implements BrowserSession {
  readonly log: string[] = [];
  readonly typed = new Map<string, string>();
  readonly selected = new Map<string, string[]>();
  private url = "about:blank";
  private closed = false;

  constructor(
    private readonly pages: Record<string, FakePage>,
    readonly profileId: string,
  ) {}

  private page(): FakePage {
    return this.pages[this.url] ?? { title: this.url === NOT_FOUND ? "Not found" : "Blank" };
  }

  private elements(): FakeElement[] {
    return this.page().elements ?? [];
  }

  private refFor(index: number): string {
    return `e${index + 1}`;
  }

  private elementByRef(ref: string): { element: FakeElement; index: number } | undefined {
    const index = this.elements().findIndex((_, i) => this.refFor(i) === ref);
    const element = this.elements()[index];
    return index === -1 || !element ? undefined : { element, index };
  }

  private renderTree(): string {
    const page = this.page();
    const lines = [`- document "${page.title}"`];
    this.elements().forEach((element, index) => {
      const parts = [`  - ${element.role} "${element.name}" [ref=${this.refFor(index)}]`];
      const typed = this.typed.get(this.refFor(index));
      if (typed !== undefined) parts.push(`: ${typed}`);
      const picked = this.selected.get(this.refFor(index));
      if (picked) parts.push(`: ${picked.join(",")}`);
      lines.push(parts.join(""));
    });
    return lines.join("\n");
  }

  private view(): BrowserSnapshot {
    const tree = this.renderTree();
    return { url: this.url, title: this.page().title, tree, hash: hashSnapshotTree(tree) };
  }

  private result(note?: string): BrowserActionResult {
    return { ok: true, snapshot: this.view(), note };
  }

  private assertOpen(): void {
    if (this.closed) throw new Error("browser session is closed");
  }

  async navigate(url: string): Promise<BrowserActionResult> {
    this.assertOpen();
    this.url = this.pages[url] ? url : NOT_FOUND;
    this.log.push(`navigate ${url}`);
    return this.result(this.url === NOT_FOUND ? `no page at ${url}` : undefined);
  }

  async snapshot(): Promise<BrowserSnapshot> {
    this.assertOpen();
    return this.view();
  }

  async click(ref: string): Promise<BrowserActionResult> {
    this.assertOpen();
    const hit = this.elementByRef(ref);
    if (!hit) return { ok: false, note: `no element ${ref}` };
    this.log.push(`click ${ref}`);
    if (hit.element.role === "link" && hit.element.href) return this.navigate(hit.element.href);
    return this.result();
  }

  async type(
    ref: string,
    text: string,
    options?: { submit?: boolean },
  ): Promise<BrowserActionResult> {
    this.assertOpen();
    const hit = this.elementByRef(ref);
    if (!hit) return { ok: false, note: `no element ${ref}` };
    this.typed.set(ref, text);
    this.log.push(`type ${ref} ${JSON.stringify(text)}${options?.submit ? " submit" : ""}`);
    if (options?.submit && this.page().submitUrl) return this.navigate(this.page().submitUrl!);
    return this.result();
  }

  async select(ref: string, values: readonly string[]): Promise<BrowserActionResult> {
    this.assertOpen();
    const hit = this.elementByRef(ref);
    if (!hit) return { ok: false, note: `no element ${ref}` };
    const allowed = new Set(hit.element.options ?? []);
    const picked = values.filter((value) => allowed.has(value));
    if (picked.length !== values.length) return { ok: false, note: `bad option for ${ref}` };
    this.selected.set(ref, [...picked]);
    this.log.push(`select ${ref} ${picked.join(",")}`);
    return this.result();
  }

  async screenshot(): Promise<{ png: Uint8Array }> {
    this.assertOpen();
    this.log.push("screenshot");
    return { png: BLANK_PNG };
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.log.push("close");
  }
}
