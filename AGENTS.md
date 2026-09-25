# Agent instructions for LS Itinerary

This project uses the anti-slop rules from https://github.com/miqdadbadjuber/anti-slop together with `DESIGN.md`.

Before changing UI, product copy, responsive layout, accessibility, or code comments:

1. Read `DESIGN.md`.
2. Apply the anti-slop core and the relevant UI, copywriting, human, layoutmobile, and code skills.
3. Preserve product-specific behavior before visual cleanup.
4. Do not introduce invented statistics, testimonials, security claims, placeholder navigation, or dead controls.
5. Run `npm run check` and verify the changed workflow before shipping.

Recommended project install for coding agents:

```bash
npx antislop-ai
```

Choose project scope, then install the core plus UI, copywriting, human, layoutmobile, and code skills. Update later with:

```bash
npx antislop-ai --update
```
