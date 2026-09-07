import { existsSync, readFileSync, writeFileSync } from "node:fs";

const FALLBACK_ID = "rk-forgot-password";

const SNIPPET = `
<p id="${FALLBACK_ID}" hidden style="position:fixed;left:0;right:0;bottom:16%;z-index:2147483647;margin:0;text-align:center;font:500 17px/1.4 system-ui,sans-serif">
  <a href="/forgot-password" style="color:inherit">Forgot password?</a>
</p>
<script>
(function () {
  var el = document.getElementById(${JSON.stringify(FALLBACK_ID)});
  if (!el) return;
  function sync() {
    var onSignIn = /\\/sign-in\\/?$/.test(location.pathname);
    var hasLink = Boolean(document.querySelector('#root a[href="/forgot-password"]'));
    el.hidden = !onSignIn || hasLink;
  }
  setInterval(sync, 400);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", sync);
  }
  sync();
})();
</script>
`;

const target = process.argv[2] ?? "/app/apps/web/dist/index.html";
if (!existsSync(target)) process.exit(0);

const html = readFileSync(target, "utf8");
if (html.includes(FALLBACK_ID)) process.exit(0);

const next = /<\/body>/i.test(html)
  ? html.replace(/<\/body>/i, `${SNIPPET}</body>`)
  : `${html}${SNIPPET}`;
writeFileSync(target, next);
