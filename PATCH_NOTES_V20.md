LS Itinerary v2.0

- Fix user access to owned and joined trips by scoping Administrator middleware to /admin only.
- Scope trip authentication to /trips and /join routes instead of intercepting unrelated requests.
- Prevent favicon.ico and other browser assets from becoming post-login return destinations.
- Administrator now returns to /admin after login unless a valid app route was intentionally requested.
- Fix owner/admin condition precedence in trip member and invite controls.
- Refresh flat UI with stronger travel-specific hierarchy, status-driven trip borders, a flat trip context header, clearer tabs, and a redesigned error page.
- No database migration required.
