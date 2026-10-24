# DA Tracker on iPhone

DA Tracker uses one shared React/Tauri 2 codebase for macOS and iOS. The phone layout uses a bottom tab bar, compact cards, and touch-friendly forms. Sign in using your **existing DA Tracker Supabase account** to access the same records.

## Prerequisites on the Mac

- Full Xcode installed and opened once to accept its licence, with the iOS platform downloaded.
- Apple developer team visible in Xcode (paid Developer Program if you want to avoid the free Personal Team's seven-day provisioning limit).
- An actual iPhone and USB cable for the first install.
- The existing Rust, Node, npm, and Tauri tools used for DA Tracker macOS builds.

From Terminal in the DA-Tracker repository:

```bash
git switch main
git pull origin main
npm install
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
xcode-select -p
rustup target add aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios
brew install cocoapods
```

If CocoaPods is already installed, Homebrew will tell you. The `.env.local` file must still have your working Supabase URL/publishable key, which will be bundled into the iPhone binary. A service-role/secret key must **never** be used.

## Generate the native Xcode project

```bash
npm run icons
npm run tauri ios init
```

`ios init` creates the platform-specific generated Xcode files on **your Mac**. Do not manually write fake/generated Xcode files. The existing macOS app continues to work.

## Install onto your iPhone

1. Plug your iPhone into the Mac, unlock, tap **Trust** if prompted, and enable **Developer Mode** in iPhone Settings > Privacy & Security if requested.
2. Keep the iPhone and Mac on a network that permits the dev server to connect. If corporate Wi-Fi blocks device-to-device traffic, use a personal network or the Tauri device TUN mode.
3. Start the iOS development session in Terminal:

```bash
npm run tauri ios dev -- --open --host
```

4. Keep this Terminal process running. In the Xcode project, select **DA Tracker > Signing & Capabilities**, enable **Automatically manage signing**, choose your paid Apple Developer team if available, and verify the iOS bundle identifier is `com.manvirsethi.datracker.ios2026`. If you already had Xcode open before pulling this change, stop the old Tauri iOS dev process and restart it from Terminal to regenerate the project with the iOS override. If Xcode still displays the old identifier, change it there as well.
5. Choose the **physical iPhone** as run destination. Press Xcode's Run button.
6. Find **DA Tracker** on the iPhone Home Screen and sign in with the *same* Supabase login as the Mac version.

The shared Supabase records should appear. Create a test application on iPhone, then reopen the Mac application to verify the record has synced.

## Troubleshooting

- **No device in Xcode:** reconnect by USB, unlock the phone, trust the computer, and check Xcode > Window > Devices and Simulators.
- **Signing error:** select the right Team, check Xcode's automatic signing and your team entitlements, and ensure the iOS bundle identifier `com.manvirsethi.datracker.ios2026` is available to your Apple Developer team. Tauri reads it from `src-tauri/tauri.ios.conf.json`, leaving the Mac identifier unchanged. If Apple reports it unavailable, use a different unique identifier in that iOS-specific file and in Xcode.
- **Vite server inaccessible:** `vite.config.ts` already uses `TAURI_DEV_HOST`. Check the firewall or local-network restrictions, and keep `npm run tauri ios dev -- --open --host` running. Follow [Tauri's development guide](https://v2.tauri.app/develop/).
- **Blank/cloud connection error:** ensure `.env.local` contains the working **publishable** key and rebuild. Confirm the iPhone has internet access.
- **Simulator:** try `npm run tauri ios dev` and select a simulator, which doesn't require physically connecting your phone.
- **Missing local Mac records:** only records already imported to Supabase will be available on the iPhone. Do not try the local SQLite import from iPhone.
- **Mobile layout:** iPhone navigation is the bottom tab bar. Mac sidebar and desktop layout stay unchanged.

## Build a standalone release

For release packaging, once development works, run `npm run tauri ios build`. Signing and provisioning are required for installation on a real device. For a personal deployment, development signing via Xcode is easiest; distribution through TestFlight requires a paid Apple Developer Program membership and App Store Connect setup.

The native iOS project must be generated and compiled on macOS with Xcode; GitHub source changes alone do not produce an installable iPhone app.
