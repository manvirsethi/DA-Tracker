# DA Tracker

DA Tracker is a small, local-first macOS app for tracking degree apprenticeship applications.

It is intentionally simple: ChatGPT or other sources can alert you to openings, and you manually add only the opportunities you actually want to pursue. Everything is stored locally on your Mac in SQLite.

## v1 features

- Manual application entry
- Pipeline view: To apply, Applied, Assessment, Interview, Offer
- Detailed application page
- Stage changes with automatic timeline history
- Multiple deadlines per application
- Dashboard with needs-attention and upcoming deadlines
- Notes, priorities and application links
- Archive for rejected, withdrawn and closed applications
- Search and stage filtering
- JSON backup export
- CSV application export
- macOS keyboard shortcuts

## Keyboard shortcuts

- `⌘N` - add application
- `⌘F` - search
- `⌘1` - dashboard
- `⌘2` - applications
- `⌘3` - archive

## Tech stack

- Tauri 2
- React
- TypeScript
- Vite
- SQLite via the official Tauri SQL plugin

## First-time setup on macOS

You need:

1. Xcode or Xcode Command Line Tools
2. Node.js 20 or later
3. Rust via rustup

Check them with:

```bash
xcode-select -p
node --version
npm --version
rustc --version
cargo --version
```

If Rust is missing:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Then clone and run:

```bash
git clone https://github.com/manvirsethi/DA-Tracker.git
cd DA-Tracker
npm install
npm run tauri:dev
```

## Build the macOS app

```bash
npm install
npm run tauri:build
```

Tauri places the generated macOS bundle under `src-tauri/target/release/bundle/macos/`.

Move `DA Tracker.app` into `/Applications` and pin it to your Dock.

## Data and backups

The SQLite database is created in the app's local data directory. No authentication, account or cloud database is used.

Use **Export backup** inside the app to create a JSON backup, and **Export CSV** for a spreadsheet-compatible copy.

## Deliberate v1 exclusions

- cloud sync
- authentication
- automatic vacancy scraping
- direct ChatGPT integration
- email integration
- multi-user support
