# LS Itinerary design direction

Design Read: travel planning utility for individuals and small groups, using a practical operations-board visual language. Dial ENERGY 2 / RHYTHM 2 / MOTION 1.

## Product character

LS Itinerary should feel organized, calm, and useful during real travel planning. It is not a travel inspiration site and it should not look like an airline booking portal. The interface prioritizes dates, places, bookings, expenses, and participant balances.

## Visual decisions and reasons

- Color: deep navy is the information anchor because it supports dense planning screens; LogiSource orange is the single action accent because it already identifies the brand.
- Layout: dashboard content is organized around real trips first; summary numbers are secondary and stay in one compact strip instead of four equal feature cards.
- Typography: use the operating system UI stack to avoid an external font dependency and keep text crisp on phones, laptops, and slow travel connections.
- Spacing: use a tighter working rhythm than a marketing page because users repeatedly scan dates, costs, and forms.
- Cards: use cards only where an item is independently actionable, such as a trip, booking, or participant. Summary metrics remain flat.
- Motion: hover and focus transitions only. No scroll reveals or decorative motion because this is a utility workspace.
- Theme: v1 is intentionally light-first. Planning tables, forms, and printable details are the main use case, and LogiSource currently uses a light operational UI. A dark theme should only be added as a complete product decision, not as an unfinished toggle.
- Identity motif: thin route lines and compact destination markers may be used where they represent travel flow. Decorative orbs, background grids, and generic gradients are not used.

## Content voice

- Product copy is concise Indonesian with familiar travel terms when useful.
- Buttons name the action: "Buat trip", "Tambah agenda", "Simpan perubahan".
- Avoid hype, generic marketing claims, fake statistics, and invented social proof.
- Status text should describe real state only.

## Accessibility

- Normal text must meet WCAG AA contrast.
- Every interactive element must have a visible focus state.
- Touch targets should be at least 44px where practical.
- Mobile is a distinct reflow state, not a squeezed desktop layout.
