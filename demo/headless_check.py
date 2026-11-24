"""Headless smoke test: load the app, collect console errors, save a screenshot."""
import os
import sys
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8031/"
OUT = sys.argv[2] if len(sys.argv) > 2 else "demo/tmp/smoke.png"

# Use the browser build already on this machine (playwright pkg/browser revision mismatch).
def find_headless_shell():
    base = os.path.join(os.environ.get("LOCALAPPDATA", ""), "ms-playwright")
    for name in sorted(os.listdir(base), reverse=True):
        candidate = os.path.join(base, name, "chrome-headless-shell-win64", "chrome-headless-shell.exe")
        if os.path.exists(candidate):
            return candidate
    return None

errors, warnings = [], []
with sync_playwright() as p:
    exe = find_headless_shell()
    browser = p.chromium.launch(executable_path=exe) if exe else p.chromium.launch()
    page = browser.new_page(viewport={"width": 1600, "height": 1000})
    page.on("console", lambda m: (errors if m.type == "error" else warnings).append(m.text) if m.type in ("error", "warning") else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL, wait_until="networkidle")
    page.wait_for_timeout(1500)
    page.screenshot(path=OUT)
    title = page.title()
    footer = page.locator("#footer-mode").inner_text()
    browser.close()

print("title:", title)
print("footer-mode:", footer)
print("console errors:", errors if errors else "none")
print("console warnings:", warnings[:5] if warnings else "none")
sys.exit(1 if errors else 0)
