# DA Tracker: Supabase setup

Project: `rqvqjxbjljvzrpwnvkuy`  
Project URL: `https://rqvqjxbjljvzrpwnvkuy.supabase.co`

DA Tracker's macOS and iOS versions use the **same signed-in Supabase account** to read and update private records. The original local SQLite database is kept, but new changes while signed in are stored in Supabase.

## 1. Create tables securely

Sign into the Supabase account which owns this project. Open:

https://supabase.com/dashboard/project/rqvqjxbjljvzrpwnvkuy/sql/new

Copy and run the SQL in [schema.sql](./schema.sql).

This creates `da_applications`, `da_deadlines`, and `da_application_events`. Every table has row-level security policies limited to `auth.uid()`. The events table records stage changes automatically. No existing tables are deleted.

After running SQL, check **Database > Tables** for all three tables, and run **Advisors > Security**. If the Data API isn't exposing the tables, enable its public schema and allow authenticated access, keeping RLS enabled. Never turn off RLS as a workaround.

## 2. Configure authentication

In the same project, go to **Authentication > Providers > Email** and ensure email/password is enabled. Use the same registered account on Mac and iPhone. Configure confirmation email delivery and check email rate limits.

DA Tracker uses **email and password** (not OAuth or magic links). Sign-up confirmation may be required depending on your project settings.

## 3. Add your *publishable* API key locally

In Supabase open **Project Settings > API Keys**. Copy the key starting with `sb_publishable_`. **Never copy or commit** a key starting with `sb_secret_` or a `service_role` key.

On your Mac, in the repo folder:

```bash
cp .env.example .env.local
```

Edit `.env.local` to replace `sb_publishable_REPLACE_ME` with your actual publishable key. The project URL is already set. The `.env.local` file is intentionally excluded by `.gitignore`.

Install dependencies and build:

```bash
npm install
npm run tauri:dev
```

Commit your generated `package-lock.json` to the repo after confirming a successful install. The Supabase JS dependency is pinned in `package.json`. For a production build:

```bash
npm run tauri:build
```

**Do not run the cloud version before applying the schema.** A missing table will cause a safe error, not silently delete local data.

## 4. Safely import your existing Mac applications

1. In your existing DA Tracker release, use **Export backup** and save the JSON file.
2. Run the new DA Tracker build, sign in and verify you can see the empty cloud dashboard.
3. From the left sidebar choose **Import Mac data**, review the counts and confirm.
4. Check the applications, statuses, deadlines, notes and history in the new cloud view.
5. Sign in with the same account on iPhone to view the same data.

The local database is **never modified** by import. Each record receives a stable source-device ID + legacy ID. Retrying an interrupted import avoids duplicates and leaves already-imported cloud updates intact. **Do not import the same database from a second device**, as each device has its own source ID.

## 5. How sync works

When signed in, the app reads and writes records in Supabase. It refreshes when you return to the app and every 30 seconds while visible. This is online-first, **not offline syncing**. Cloud writes require a connection; offline data creation isn't supported yet. You can still retrieve your original old local SQLite database using the untouched `src/local-db.ts` implementation.

The authentication session is stored by the Supabase client in the platform's webview storage. For a production mobile release, use the standard Tauri mobile security checks, HTTPS only, and consider a native secure-storage plugin before storing other sensitive material.

## 6. Verify the live setup

With one signed-in user, create an application, change its stage, add a deadline, then sign in on a second device. Verify that all data appears after refresh. Sign in with a **different** account and verify that none of the first user's rows are visible. Confirm the schema's RLS policies and security advisors report no unexpected access.

## Notes

- This branch is intentionally isolated from `main`.
- The separate Supabase account must apply the SQL; ChatGPT's currently connected Supabase account does not have access to this project.
- The cloud data model uses Supabase-generated numeric IDs; existing SQLite IDs are mapped during import.
- Custom statuses continue to work.
