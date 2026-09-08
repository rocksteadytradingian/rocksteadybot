import type { BrowserDriver } from "@rakazo/adapter-kit";

const CTX = {
  operationId: "conformance",
  traceId: "conformance",
  workspaceId: "w",
  userId: "u",
  signal: new AbortController().signal,
};

export type ContractAssert = (ok: boolean, message: string) => void;

/**
 * The offline contract every {@link BrowserDriver} must satisfy. Runs against the fake in CI
 * and can be pointed at a real driver locally. `pages` must expose:
 * - `home` with a link `To page two` → `two`, a `Search` textbox that submits to `results`,
 *   and a `Colour` combobox with options `red` and `green`.
 */
export async function runBrowserContractChecks(
  driver: BrowserDriver,
  pages: { home: string; two: string; results: string },
  assert: ContractAssert,
): Promise<void> {
  const session = await driver.open("conformance-profile", CTX);
  try {
    const landed = await session.navigate(pages.home);
    assert(landed.ok, "navigate to home succeeds");
    assert(Boolean(landed.snapshot), "navigate returns a snapshot");
    assert(landed.snapshot?.url === pages.home, "snapshot url matches the target");

    const snap = await session.snapshot();
    assert(snap.tree.includes("[ref="), "snapshot tree carries ref handles");
    assert(snap.hash.length > 0, "snapshot has a hash");
    const again = await session.snapshot();
    assert(again.hash === snap.hash, "an unchanged page hashes the same");

    const linkRef = matchRef(snap.tree, "To page two");
    assert(Boolean(linkRef), "the page-two link has a ref");
    const clicked = await session.click(linkRef!);
    assert(clicked.ok && clicked.snapshot?.url === pages.two, "click follows the link");
    assert(clicked.snapshot?.hash !== snap.hash, "navigation changes the hash");

    await session.navigate(pages.home);
    const fresh = await session.snapshot();
    const searchRef = matchRef(fresh.tree, "Search");
    assert(Boolean(searchRef), "the search textbox has a ref");
    const typed = await session.type(searchRef!, "hello", { submit: true });
    assert(typed.ok && typed.snapshot?.url === pages.results, "type + submit navigates");

    await session.navigate(pages.home);
    const withSelect = await session.snapshot();
    const colourRef = matchRef(withSelect.tree, "Colour");
    assert(Boolean(colourRef), "the colour combobox has a ref");
    const picked = await session.select(colourRef!, ["green"]);
    assert(picked.ok, "selecting a valid option succeeds");
    const rejected = await session.select(colourRef!, ["purple"]);
    assert(!rejected.ok, "selecting an unknown option fails");

    const shot = await session.screenshot();
    assert(shot.png.byteLength > 0, "screenshot returns PNG bytes");

    const missing = await session.click("e9999");
    assert(!missing.ok, "acting on an unknown ref fails without throwing");
  } finally {
    await session.close();
    await session.close();
  }
}

function matchRef(tree: string, name: string): string | undefined {
  const line = tree.split("\n").find((row) => row.includes(`"${name}"`));
  return line?.match(/\[ref=([^\]]+)\]/)?.[1];
}
