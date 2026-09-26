LS Itinerary v2.0.1 hotfix

- Restores dateKey() and todayDateKey() exports removed accidentally in v2.0.
- Keeps the safer login returnTo filtering from v2.0.
- Restores robust date handling for PostgreSQL DATE values.
- Fixes existing date-utils tests while retaining navigation-utils tests.
