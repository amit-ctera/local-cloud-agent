# Local Cloud Agent

A secure desktop application that exposes [Cursor CLI](https://cursor.com) remotely through an ngrok tunnel, with an Android companion app for on-the-go access.

## Architecture

```
┌──────────────┐     ┌───────────┐     ┌────────────────────────────────┐
│  Any Client  │────▶│  ngrok    │────▶│  Local Cloud Agent (Desktop)   │
│  (Phone/Web) │◀────│  Tunnel   │◀────│  Express + Auth + SQLite       │
└──────────────┘     └───────────┘     │         │                      │
                                       │         ▼                      │
                                       │  Cursor CLI (--api-key)        │
                                       └────────────────────────────────┘
```

- **Desktop App** (`server/`): Electron app with a dashboard UI showing server status, ngrok URL, QR code, and activity log. Includes authentication (signup/signin), encrypted SQLite storage for API keys, and programmatic ngrok tunneling.
- **Android App** (`android/`): Companion app to send prompts to the Cursor agent from your phone.

## Download

Download the latest Windows installer from [GitHub Releases](https://github.com/amit-ctera/local-cloud-agent/releases/latest).

## Development

### Desktop App (server/)

```bash
cd server
npm install
npm run dev
```

### Android App (android/)

Open `android/` in Android Studio and build normally.

## Security

- Passwords are bcrypt-hashed
- Cursor API keys are AES-256-GCM encrypted at rest
- Short-lived access tokens (15 min) + rotating refresh tokens (30 days)
- ngrok provides TLS encryption in transit
- The server always passes the user's API key via `--api-key` flag to the CLI (never uses the machine's logged-in session)

## License

MIT
