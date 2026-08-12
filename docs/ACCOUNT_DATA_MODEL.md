# Account data model

This is a database-agnostic policy model, not a claim that a hosted database or email service exists. It specifies private account credentials, verified-email state, saved geometry/radius, preferences, send history, one-click unsubscribe tokens, deletion requests, and correction records. Owner filters enforce row isolation in this pure model. Deletion becomes due after 30 days; send history expires after 24 months.
