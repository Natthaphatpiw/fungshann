# Fong Shann HR System

## Supabase Setup

1. Create `.env.local` from `.env.example` and fill real keys.
2. Open Supabase SQL Editor and run:
   - `supabase/schema.sql`
3. Migrate existing CSV data into Supabase:

```bash
npm run migrate:supabase
```

## Development

```bash
npm install
npm run dev
```
