# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please do **not** open a public issue or pull request. Instead, contact the maintainers privately through the designated security channel.

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| 3.1.0   | :white_check_mark: Yes |

## Security Practices

- All secrets are managed via environment variables or Render Environment panels
- `.env` is never committed (enforced by `.gitignore`)
- Audit logs are stored in `logs/developer-audit.log` with permission `0600`
- Session cookies are `HttpOnly`, `Secure`, and `SameSite=Lax`