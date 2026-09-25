# Anti-slop integration

LS Itinerary adopts anti-slop as a development filter, not as an application runtime dependency.

The current UI pass uses these project decisions:

- no generic blue-purple or multicolor gradients
- no decorative glassmorphism
- no fake statistics or testimonials
- no generic marketing CTA text
- no uppercase wide-tracked section labels
- one orange action accent over a navy and neutral foundation
- visible keyboard focus states
- mobile layouts reflow into single-column work areas
- date handling is deterministic and timezone-safe for PostgreSQL `DATE` values

The official project can be installed into a coding-agent workspace with `npx antislop-ai`. The source remains owned and licensed by its original author; this repository only references it and applies its rules.
