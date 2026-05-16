---
name: project-service-icons
description: Create and wire small local SVG service icons for this specific finance app. Use when the user asks for a new icon, brand icon, app icon, service icon, bill icon, store icon, or category icon inside this project; add the SVG to public/service-icons and register it in src/domain/iconRegistry.ts with sensible Portuguese aliases for search suggestions.
---

# Project Service Icons

Use this skill only for this repository.

## Workflow

1. Create one small SVG file in `public/service-icons/`.
2. Use kebab-case for the filename and icon id, for example `youtube.svg` and `youtube`.
3. Keep the SVG self-contained:
   - `viewBox="0 0 64 64"`
   - rounded square background, usually `rx="16"`
   - simple vector shapes and optional short text
   - no external images, fonts, scripts, or remote URLs
   - no downloaded brand assets unless the user explicitly asks for downloaded files
4. Update `src/domain/iconRegistry.ts`:
   - add a `serviceIcons` item with `id`, `label`, `src`, and `aliases`
   - set `src` to `/service-icons/<filename>.svg`
   - include the official/common name plus Portuguese search terms the user might type
5. Run `npm run build` after changes. Run tests when behavior changed beyond adding registry data.
6. Tell the user which icon file and registry entry were added.

## Existing App Pattern

Read `references/icon-pattern.md` when you need a compact example of the SVG and registry format.

## Alias Guidance

Use aliases that match how the user naturally searches in this app. Examples:

- internet provider: official name, `internet`, `telefone`, `celular`, `plano`
- power bill: official name, `energia`, `luz`, `conta de luz`
- water bill: official name, `agua`, `saneamento`, `conta de agua`
- delivery: official name, `delivery`, `comida`, `restaurante`, `lanche`
- store: official name, `compra`, `shopping`, `loja`, `marketplace`
- streaming: official name, `streaming`, `filme`, `serie`, `entretenimento`

Prefer ASCII in aliases because the registry normalizes accents during search.
