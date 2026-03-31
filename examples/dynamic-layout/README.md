# Dynamic Layout

Editorial layout with rotating logo obstacles and text reflow at 60fps.

## Entries

| Filename | Entry | Architecture |
|----------|-------|--------------|
| `dynamic-layout.tsx` | `main` | BTS + MTS hybrid (runOnBackground) |
| `dynamic-layout-mts.tsx` | `mts-only` | Pure MTS (shared modules) |
| `dynamic-layout-bts.tsx` | `bts-only` | Pure BTS (React rAF loop) |
