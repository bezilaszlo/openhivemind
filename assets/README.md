- `banner.svg` / `banner.png` — 1280x640 README banner (mark + wordmark + tagline on #FAF8F5); `frontend/public/mark.svg` is the bare mark (`currentColor`), `favicon.svg` the fixed-teal favicon, `logo.svg` the horizontal lockup.
- Mark: 7x7 dot grid clipped to a circle, dot radius falling off from the centre (r = 3.9 - 1.5 * (d/28.6)^1.1 in a 64-unit viewBox), 37 dots, no strokes or gradients.
- Accent teal: `#3A8291` (4.14:1 on #FAF8F5, 4.12:1 on #14161A — no single teal reaches 4.5:1 on both; passes 3:1 for UI/large text on each).
- Regenerate the PNG with `rsvg-convert assets/banner.svg -o assets/banner.png` (or `npx -y @resvg/resvg-cli assets/banner.svg assets/banner.png`).
- Everything in this directory and in `frontend/public/` is MIT-licensed, like the
  rest of the repository; third-party marks keep their own licence, recorded below.

## Harness marks

Inline 16 px `currentColor` glyphs in `frontend/src/lib/harness.tsx`, one per
capture source. Each brand's own terms decided whether we may use its mark.
Being listed in an icon set is not permission: Simple Icons is CC0 for its own
work and its
[disclaimer](https://github.com/simple-icons/simple-icons/blob/develop/DISCLAIMER.md)
asks users to obtain the brand's permission themselves.

- **Claude Code** — ours, not Anthropic's. The
  [Anthropic trademark guidelines](https://www.anthropic.com/legal/trademark-guidelines)
  say "You may only use our trademarks as specifically permitted by us and only
  in materials we approve beforehand" and carry no nominative-use exception, so
  we do not ship Anthropic's mark. A filled wedge stands in.
- **Codex** — ours, not OpenAI's. The
  [OpenAI brand guidelines](https://openai.com/brand/) let third parties use the
  logo only in accordance with those guidelines and with OpenAI's permission
  (`partnercomms@openai.com`), so we do not ship OpenAI's mark. A terminal
  caret stands in.
- **opencode** — the project's own mark, the `fill-rule="evenodd"` path from
  `packages/ui/src/assets/favicon/favicon.svg` in
  [anomalyco/opencode](https://github.com/anomalyco/opencode), used verbatim
  with the viewBox cropped to the mark for optical size. That repository is
  MIT-licensed with no trademark reservation, which covers this use.

If Anthropic or OpenAI grant permission, swap the stand-ins for their marks and
record the grant here.
