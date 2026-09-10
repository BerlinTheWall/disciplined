"""Render the published policies into a small static site for GitHub Pages.

Only the documents that need a public URL are published — the App Store and
Play Console both require a link a reviewer can open, and a file in a git
repository is not one. Everything else in docs/ is for people working on the
project and stays in the repository.

    python scripts/build_pages.py            # writes _site/
    python scripts/build_pages.py --check    # report readiness, write nothing

Readiness has two conditions, both checked here rather than in the workflow so
they can be run locally:

  - No unfilled placeholders. A placeholder is an all-capitals token in square
    brackets, e.g. [POSTAL ADDRESS].
  - No draft banner. The banner is deliberately the switch: deleting it is how
    you say a lawyer has read the document.
"""

import argparse
import html
import re
import shutil
import sys
from pathlib import Path

import markdown

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "_site"

PAGES = [
    ("privacy", "Privacy Policy", ROOT / "docs" / "PRIVACY.md"),
    ("terms", "Terms of Service", ROOT / "docs" / "TERMS.md"),
]

PLACEHOLDER = re.compile(r"\[[A-Z][A-Z ]*\]")
DRAFT_MARKER = "Draft — not yet legally reviewed"

STYLE = """
:root {
  --ink: #17181f; --soft: #4d505f; --paper: #ffffff; --wash: #f6f6fa;
  --rule: #e3e3ec; --accent: #4f46e5;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --ink: #e9e9f1; --soft: #a8aabc; --paper: #14151c; --wash: #1c1d26;
    --rule: #2b2c3a; --accent: #9089f6;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--paper); color: var(--ink);
  font: 16px/1.65 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  -webkit-font-smoothing: antialiased;
}
.wrap { max-width: 46rem; margin: 0 auto; padding: 3.5rem 1.25rem 6rem; }
nav { margin-bottom: 2.5rem; font-size: .9rem; }
nav a { color: var(--soft); text-decoration: none; margin-right: 1.25rem; }
nav a:hover, nav a:focus-visible { color: var(--accent); }
h1 { font-size: clamp(1.9rem, 5vw, 2.5rem); line-height: 1.15; margin: 0 0 1rem; letter-spacing: -.02em; }
h2 { font-size: 1.3rem; margin: 2.5rem 0 .6rem; letter-spacing: -.01em; }
h3 { font-size: 1.05rem; margin: 1.8rem 0 .4rem; }
p, li { color: var(--soft); }
h1 + p, h2 + p { margin-top: .3rem; }
strong { color: var(--ink); font-weight: 600; }
a { color: var(--accent); text-underline-offset: 2px; }
hr { border: 0; border-top: 1px solid var(--rule); margin: 2.5rem 0; }
code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .88em;
  background: var(--wash); border: 1px solid var(--rule); border-radius: 3px; padding: .08em .35em;
}
blockquote {
  margin: 1.5rem 0; padding: .9rem 1.1rem; background: var(--wash);
  border-left: 3px solid var(--accent); border-radius: 0 6px 6px 0;
}
blockquote p { margin: .4rem 0; }
table { border-collapse: collapse; width: 100%; margin: 1.25rem 0; font-size: .93rem; display: block; overflow-x: auto; }
th, td { text-align: left; padding: .6rem .8rem; border-bottom: 1px solid var(--rule); vertical-align: top; }
th { color: var(--ink); font-weight: 600; white-space: nowrap; }
footer { margin-top: 4rem; padding-top: 1.25rem; border-top: 1px solid var(--rule); font-size: .85rem; color: var(--soft); }
"""

SHELL = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} — Disciplined</title>
<meta name="description" content="{title} for Disciplined.">
<style>{style}</style>
</head>
<body>
<div class="wrap">
<nav><a href="./">Disciplined</a><a href="./privacy/">Privacy</a><a href="./terms/">Terms</a></nav>
{body}
<footer>Disciplined — {title}. Questions: see the contact section above.</footer>
</div>
</body>
</html>
"""

INDEX_BODY = """<h1>Disciplined</h1>
<p>An AI personal assistant and scheduler for iOS and Android.</p>
<p>This site publishes the documents the app stores require a public link to:</p>
<ul>
  <li><a href="./privacy/">Privacy Policy</a> — what the app collects, who else sees it, and how to delete it.</li>
  <li><a href="./terms/">Terms of Service</a></li>
</ul>
"""


def readiness() -> list[str]:
    """Reasons this must not be published yet. Empty means ready."""
    problems = []
    for _, title, path in PAGES:
        text = path.read_text(encoding="utf-8")
        found = sorted(set(PLACEHOLDER.findall(text)))
        if found:
            problems.append(f"{path.relative_to(ROOT)}: unfilled {', '.join(found)}")
        if DRAFT_MARKER in text:
            problems.append(f"{path.relative_to(ROOT)}: still marked as a draft")
    return problems


def render(md_text: str) -> str:
    return markdown.markdown(md_text, extensions=["tables", "sane_lists", "attr_list"])


def build() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)

    for slug, title, path in PAGES:
        page = OUT / slug
        page.mkdir()
        body = render(path.read_text(encoding="utf-8"))
        (page / "index.html").write_text(
            SHELL.format(title=html.escape(title), style=STYLE, body=body), encoding="utf-8"
        )

    (OUT / "index.html").write_text(
        SHELL.format(title="Disciplined", style=STYLE, body=INDEX_BODY), encoding="utf-8"
    )
    # Stop Pages running these through Jekyll, which would mangle the output.
    (OUT / ".nojekyll").write_text("", encoding="utf-8")
    print(f"built {OUT.relative_to(ROOT)}: " + ", ".join(slug for slug, _, _ in PAGES) + ", index")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="report readiness, write nothing")
    args = parser.parse_args()

    problems = readiness()
    if args.check:
        if problems:
            print("NOT READY to publish:")
            for p in problems:
                print(f"  - {p}")
        else:
            print("READY to publish")
        return 0

    if problems:
        print("Refusing to build: the policies are not ready to be public.", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        return 1

    build()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
