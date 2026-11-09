# ARMY Christmas Sky — MY PURPLE SKY

MY PURPLE SKY is a personal, shareable BTS universe. Each owner creates one sky with a unique public URL. Visitors can leave a 3D star and dedication without creating an account.

## Experience
- Personal skies with unique public links: `/sky/<slug>`.
- Owner accounts via Supabase Auth (email + password).
- Guest star submissions without sign-up.
- 3D star geometry: star, diamond, heart, moon and crystal.
- Color, size and glow/effect customization.
- Infinite sky and 3D planet views use the same saved positions and star records.
- Dedication modal, live star count, owner moderation (hide/show/delete).
- Public gallery at `/gallery`.
- Responsive layout for mobile and desktop.
- No seeded/demo dedications are displayed.

## Backend
- Supabase project: `army-christmas-sky`.
- Tables: `public.skies`, `public.stars`.
- Realtime: `public.stars` is in `supabase_realtime`.
- Storage bucket: `sky-artwork` (private; owner-folder policies).
- Row Level Security is enabled on both public tables.
- Anonymous users can only read public skies/visible stars and insert stars into public skies.
- Only the authenticated sky owner can edit sky settings, moderate or delete its stars.
- The old token-based prototype tables are retained as `legacy_skies` and `legacy_stars`, with API access revoked. They are not shown in the new application.

## Supabase client
The browser uses the project's publishable key only. No service-role or secret key is included in the client.
The schema is documented in `supabase/schema.sql`.

## Run
This is a static ES-module app. Open `index.html` through Bolt or a static host. The import map loads React, Three.js and Supabase JS. Vercel rewrites route requests for `/sky/*` and `/gallery` to `index.html`.

## First use
1. Open the app and choose **Crear mi cielo personal**.
2. Register with an email and password. If email confirmation is enabled, confirm the message before signing in.
3. Your personal sky is created automatically and its public URL can be copied and shared.
4. Friends can open the URL and leave stars without accounts.
5. Open **Administrar cielo** to edit its title/description, make it public/private, and hide or delete dedications.

## Notes
- Public skies are discoverable in the gallery; private skies are only visible to their owner.
- Star messages are stored in Postgres and are not kept only in browser local storage.
- The owner can moderate messages at any time.
