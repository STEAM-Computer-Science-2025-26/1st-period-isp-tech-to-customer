# Tailwind UI Style Guide

This guide captures the visual language currently used across the app so new pages match existing admin UI patterns.

## Theme tokens

Theme values come from `app/globals.css` and are exposed via Tailwind theme variables.

Use semantic tokens instead of hardcoded hex values:

- Backgrounds: `bg-background-main`, `bg-background-primary`, `bg-background-secondary`
- Text: `text-text-main`, `text-text-secondary`, `text-text-tertiary`
- Accent: `bg-accent-main`, `text-accent-text`, `text-accent-text-dark`
- State colors:
  - Success: `bg-success-background/15`, `text-success-text`, `border-success-foreground/30`
  - Info: `bg-info-background/15`, `text-info-text`, `border-info-foreground/30`
  - Warning: `bg-warning-background/20`, `text-warning-text`, `border-warning-foreground/30`
  - Destructive: `bg-destructive-background/15`, `text-destructive-text`, `border-destructive-foreground/30`

## Core layout patterns

### Page shell

- Use `MainContent` for standard pages.
- Preferred page spacing:
  - Root wrapper: `className="flex flex-col gap-4"`
  - Major sections: `mx-2` containers

### Primary surfaces

- Base card/list surface:
  - `rounded-xl border border-background-secondary bg-background-primary`
- Headers inside surfaces:
  - `border-b border-secondary/50`
- Dense tables/lists:
  - `divide-y divide-background-secondary/50`

### Side panel

- Use shared `components/layout/SidePanel.tsx`
- Render high-context details and quick actions in side panel before forcing route navigation

## Typography and hierarchy

- Section title: `text-base font-semibold text-text-main`
- Card title: `text-sm font-semibold text-text-main`
- Meta labels: `text-xs text-text-tertiary uppercase tracking-wide`
- Normal body: `text-sm text-text-secondary`

## Buttons

### Primary action

- `bg-accent-main text-white hover:opacity-90`
- Add rounded and padding by density:
  - Small actions: `rounded-lg px-3 py-1.5 text-xs`
  - Standard actions: `rounded-lg px-3 py-2 text-sm`

### Secondary action

- `border border-background-secondary text-text-secondary hover:bg-background-secondary`

### Destructive/Warning actions

- Follow state token pairings (background + text + border)
- Keep these visually distinct from neutral secondary buttons

## Badges and chips

### Status badge pattern

```tsx
<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border" />
```

Map status to tokenized state colors (success/info/warning/destructive/neutral).

### Priority badge pattern

Use the same chip shape with different tone classes by priority value.

## KPI strips

- Use horizontal strip pattern with `FadeEnd`:
  - `wrapperClassName="flex px-2 flex-row h-full w-full overflow-x-auto no-scrollbar gap-3 bg-transparent"`
- KPI card widths:
  - `className="w-xs shrink-0"`

## Forms and filters

- Search inputs:
  - `rounded-lg border border-background-secondary bg-background-main`
  - Include icon + compact text size (`text-sm`)
- Filter selects:
  - `rounded-lg border border-background-secondary bg-background-main px-2.5 py-2 text-xs`

## Tailwind lint conventions in this repo

Tailwind lint prefers tokenized classes over arbitrary bracket classes where equivalents exist.

Examples:

- Prefer `w-115` over `w-[460px]`
- Prefer `min-h-25` over `min-h-[100px]`
- Prefer `max-w-30` over `max-w-[120px]`
- Prefer `min-w-5` over `min-w-[1.25rem]`

These utility classes are provided via custom theme extensions in `tailwind.config.ts` (see `theme.extend.spacing`, `theme.extend.width`, `theme.extend.minWidth`, and `theme.extend.maxWidth`). If you introduce new sizing tokens, add them to the Tailwind config and update this guide.

When in doubt, use existing tokenized spacing/size classes first.

## Animation and transitions

Keep transitions subtle and utility-based:

- Color transitions: `transition-colors`
- Opacity transitions: `transition-opacity`
- Standard duration already defined via theme; avoid custom durations unless necessary.

## New component checklist

1. Uses semantic theme tokens (no hardcoded hex).
2. Matches `rounded-xl border border-background-secondary bg-background-primary` surface style.
3. Uses compact text hierarchy (`text-base`/`text-sm`/`text-xs`).
4. Uses shared status/priority chip pattern for states.
5. Avoids bracket arbitrary values when tokenized alternatives exist.
