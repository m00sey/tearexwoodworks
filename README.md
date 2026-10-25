# Tea Rex Woodworks

A single-page static site. No build step, no WordPress, no database. Open `index.html` in a browser and it works.

```
site/                     the deployable. Upload this folder's contents anywhere, as-is.
  index.html              the page
  css/site.css            styles (light and dark themes)
  js/site.js              mobile menu, gallery filters, lightbox (page works without it)
  img/                    photos as WebP, two sizes each (-700 for the grid, -1400 for full view)
  .nojekyll               tells GitHub Pages to serve the folder untouched
  _headers                cache rules when served by Cloudflare (replaces the .htaccess ones)
  .assetsignore           files in this folder that Cloudflare must not upload
.github/workflows/        preview deploy of site/ to GitHub Pages (for tweaking, not his hosting)
tools/add-image.py        resizes and watermarks a photo for the gallery
tools/hero-image.py       makes the banner image, with the dark fade baked into the file
worker/                   the Cloudflare Worker: serves site/ as static files and runs the quote-form API (D1)
  .github/workflows/deploy.yml   deploys it on push to main once CLOUDFLARE_API_TOKEN is set
Makefile                  `make zip` builds dist/tearexwoodworks-site.zip for Bluehost
SUNDAY-STEPS.md           the to-do list: finish the form fix now, then move everything to Cloudflare
README.md                 this file
```

Everything outside `site/` is repo plumbing. Only `site/` goes to a host.

## Hosting

The domain is registered at Network Solutions and its DNS is served by Bluehost's nameservers. The site is moving to Cloudflare (see `SUNDAY-STEPS.md`, Part 2): the Worker in `worker/` already serves the whole site at https://tearex-contact.tearexwoodworks.workers.dev, and the custom domain is switched on at cutover. Until then Bluehost is live, which is Option A below.

**Option A: stay on Bluehost, drop WordPress (easiest, nothing to move)**
1. Bluehost cPanel → File Manager → `public_html`.
2. Delete the WordPress files (or move them into a `_old` folder for a while).
3. Upload the contents of `site/` (`index.html`, `css/`, `js/`, `img/`) into `public_html`.
4. Done. Domain, SSL and DNS stay exactly as they are. He keeps paying Bluehost, but the site is now four files instead of a WordPress install to keep patched.

**Option B: Cloudflare Pages (free, cancel Bluehost)**
1. Create a free Cloudflare account and add `tearexwoodworks.com`. Cloudflare copies the existing DNS records.
2. Cloudflare gives you two nameservers. Log in to Network Solutions and replace the Bluehost nameservers with those. Takes up to a day to propagate.
3. Cloudflare → Workers & Pages → Create → Pages → Direct upload. Drag the `site/` folder in. Build command: none.
4. Custom domains → add `tearexwoodworks.com` and `www`. Cloudflare writes the DNS record itself.
5. Once it resolves, cancel the Bluehost plan.

Before doing B, check whether any email at the domain runs through Bluehost. His contact address is a Gmail one, so probably not, but if there are MX records they need to survive the move (step 1 copies them).

## Preview builds (GitHub Pages)

This is for tweaking, not for his hosting. The workflow in `.github/workflows/pages.yml` publishes `site/` to https://m00sey.github.io/tearexwoodworks/ on every push to `main`, so a change can be looked at on a real URL and a phone before it goes to Bluehost.

One-time setup after pushing the repo: Settings → Pages → Source: **GitHub Actions**. That's it. All paths in the page are relative, so it works under the `/tearexwoodworks/` subpath without any changes.

When a version is ready for him, run `make zip` and upload `dist/tearexwoodworks-site.zip` to Bluehost as in Option A.

## The quote form

The form posts to a small Cloudflare Worker, `worker/`, at `https://tearex-contact.tearexwoodworks.workers.dev/submit`. It is not on Bluehost at all, so Bluehost's PHP, mail server and Cloudflare challenge are out of the picture. The Worker:

1. **Stores the request first** in a D1 (SQLite) database. From that moment it cannot be lost.
2. **Emails it** to his inbox through Resend, with `Reply-To` set to the customer. If the email fails for any reason the row stays `pending` and an hourly cron retries it.
3. **Shows the result honestly.** With JS the page sends in the background and shows success or the specific problem in place. Without JS the browser posts directly and comes back to `/?sent=1` or `/?sent=0&why=...` as before. Nothing is ever reported as sent unless it was stored.

Spam control is the same honeypot and 3-second timing check as before, plus a limit of 5 requests per IP per 10 minutes. Flagged requests are stored as `spam` and not emailed, but they are visible (and restorable) in the admin page, so a false positive is no longer a lost order.

**Admin page:** `https://tearex-contact.tearexwoodworks.workers.dev/admin` lists every request, newest first, with its email status and a "Send now" button. `/admin.csv` downloads them. User `tearex`; the password is the `ADMIN_PASS` secret. `/health` is a public JSON status line (count of requests, how many are still awaiting email, whether email is configured).

**Deploying changes** (needs Node and a Cloudflare login; `npx wrangler login` once):
```
cd worker && npx wrangler deploy
```
Config is `worker/wrangler.toml`; code is `worker/src/index.js`; `worker/schema.sql` is applied with `npx wrangler d1 execute tearex-contact --remote --file schema.sql`. Secrets are set with `npx wrangler secret put NAME`: `MAIL_TO` (his inbox), `ADMIN_PASS`, and `RESEND_API_KEY`. Until `RESEND_API_KEY` is set, requests are saved and the admin page shows a warning that email is off.

**Resend setup** (once): create a free account at resend.com, add the domain `tearexwoodworks.com`, and add the DNS records it gives you in Bluehost's cPanel → Zone Editor. Then create an API key and `npx wrangler secret put RESEND_API_KEY`. The `MAIL_FROM` in `wrangler.toml` must be at the verified domain.

**Moving the Worker to his own Cloudflare account** later: `npx wrangler login` as him, `npx wrangler d1 create tearex-contact`, paste the new `database_id` into `wrangler.toml`, apply `schema.sql`, set the three secrets, deploy. Copy the data with `npx wrangler d1 export tearex-contact --remote --output dump.sql` from the old account and `d1 execute --file dump.sql` on the new one. The workers.dev hostname is per account, so change the form's `action` in `site/index.html` and the URL above to match.

The preview on GitHub Pages sends for real (its origin is in `ALLOWED_ORIGINS`), which is the easiest way to test end to end; the admin page shows which origin a request came from.

## Contact details on the page

The only way in from the page is the form. No email address, no phone number. Reasons and what to do when that changes:

- **Phone.** There is a Google Voice number that forwards to his cell with screening on, but it is not on the page. If he wants it there, the snippet is in the go-live checklist. His cell is never on the site.
- **Email.** Publishing it in a `mailto:` link is what fills an inbox with spam. If he wants it visible anyway, put it in as text with the `@` spelled out, not as a link.

## Go-live checklist (do this sitting with him)

Needs his phone in hand and his Gmail logged in. About 30 minutes.

**1. Google Voice number (10 min)**
1. On his laptop, go to voice.google.com signed in as the shop Gmail account, not his personal one.
2. Choose a number. Search by city or the 610 area code so it looks local.
3. It asks for a forwarding phone. Enter his cell and type in the SMS code it sends.
4. Settings → Calls: forwarding to his cell on, **Screen calls on** (callers say their name before it rings through). Record a short voicemail greeting.
5. Install the Google Voice app on his phone and sign in. Texts to the number arrive there, and he can reply from it.
6. Decide whether it goes on the site. It's not there right now.

**2. Form** — runs on Cloudflare, nothing to set up on Bluehost. Send one test request from the live site and check it arrives in his inbox and on the admin page.

**3. Put both into the site (5 min)**
1. The form needs nothing on Bluehost.
2. If the number is going on the page, add under the contact heading paragraph in `site/index.html`:
   ```html
   <p class="direct-line">Call or text <a href="tel:+1XXXXXXXXXX">(XXX) XXX-XXXX</a></p>
   ```
   The style for that line already exists.
3. Commit, push, wait a minute, hard-refresh the preview and check both the number and the form.

**4. Bluehost (10 min)**
1. Bluehost → cPanel → File Manager → `public_html`.
2. Select everything there and move it into a new folder called `_old-wordpress`. Don't delete it yet.
3. Upload the contents of `site/` (`index.html`, `css`, `js`, `img`, `.nojekyll` is harmless). Zip the folder first and use "Extract" in File Manager, it's faster than uploading 30 files.
4. Load tearexwoodworks.com. If the old site still shows, it's Bluehost's Cloudflare cache: cPanel → Cloudflare → Purge, or wait a few minutes.
5. Once it's right, delete `_old-wordpress` and, in Bluehost's WordPress tools, remove the WordPress install so it stops needing updates.

## Updating the live site (cache)

Bluehost fronts the site with Cloudflare, and `.htaccess` tells browsers to cache css/js for a day and images for 30 days. So after uploading a changed file:

1. Bump the version on the css/js links in `site/index.html` (`?v=20260922` → today's date). A changed `index.html` is always fetched fresh; the version string makes the browser fetch the new css/js too.
2. Upload the changed files and the new `index.html`.
3. If people still see the old version, cPanel → Cloudflare → Purge Everything.

Images are only cached by filename, so a replaced photo needs a new filename (that's why the current ones end in `-v2`: they were renamed when the watermark was added). After uploading renamed photos, delete the old files from `public_html/img` so the previous versions can't still be fetched by URL.

## Adding a piece to the gallery

Every gallery photo is watermarked (the banner, the CNC shop photo and the two craft show photos are not): the logo laid translucently across the whole image, with "© 2026 TEA REX WOODWORKS, LLC" (the year it was stamped) through the middle, so it can't be cropped out. `tools/add-image.py` resizes, watermarks and converts in one step, so don't put photos into `site/img/` by hand.

1. Export the photo as JPEG or PNG (for an iPhone HEIC: `sips -s format jpeg photo.heic --out photo.jpg`), then:
   ```
   tools/add-image.py photo.jpg name
   ```
   That writes `site/img/name-700.webp` and `site/img/name-1400.webp`, both watermarked, and prints a `<figure>` block with the right paths and dimensions. It needs Pillow once: `pip3 install pillow`.
2. Paste the block into the gallery in `site/index.html` and fill in the `alt` text, the title and the tag.
3. Set `data-kind` to `wildlife`, `signs`, `portraits` or `art` so the filter buttons pick it up.

Always start from the original photo, not a file already in `site/img/`. The script won't watermark the same file twice (stamped files carry a copyright tag in their metadata), and it refuses to overwrite an existing name. A WebP that got into `site/img/` without a watermark can be stamped in place with `tools/add-image.py --stamp site/img/name-700.webp site/img/name-1400.webp`. The owner name, logo size and opacities are constants at the top of the script; the logo itself is `site/img/logo-white.png`.

## The banner image

The banner (`site/img/lion-pride-hero.webp`) has no watermark because the headline sits over it. Instead, most of the dark fade is baked into the file, so a copy saved from the page is the darkened one. The rest of the fade is the `.hero::after` gradient in `site/css/site.css`; the two multiply to the full strength, so change them together. To rebuild or replace it: `tools/hero-image.py photo.jpg`. Don't run `add-image.py --stamp` over it.

## Copy to confirm with the owner

The old site's contact block still had WordPress template placeholders (123 Craft Lane, (123) 456-7890). Those are gone. The following is written from the photos and the area code on the old site and should be checked:

- "Southeastern Pennsylvania" / "near Philadelphia" for location (hero, workshop section, footer).
- The wood species list in the shop section (cherry, walnut, mahogany, oak).
- "Pickup or ship" and the turnaround wording in How it works.
- The size line in the workshop facts. Replacing "up to the size of the CNC bed" with the actual bed size (for example "up to 24 x 48 in") is more useful to a customer.
- Gallery titles. Adding wood species and size to each caption (for example "Walnut, 8 x 30 in") would make the gallery stronger.
- Social links. The old site's Facebook/Instagram links were empty placeholders, so none are included. Add real ones to the footer if he has them.
