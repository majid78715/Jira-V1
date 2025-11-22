# Security

- Local development only: uploads are stored under `uploads/`.
- Secrets belong in `.env` files that mirror `.env.example` but are never committed.
- JWT secret + cookie name drive identity; `sessionMiddleware` reads the token on each request and RBAC middleware enforces roles.
- Invitation tokens are opaque UUIDs stored in `db/userInvitations`; acceptance requires matching token + password + full profile, and users remain `PENDING_APPROVAL` until a PM decision.
