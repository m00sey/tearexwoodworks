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

Since 25 Oct 2026 the site runs on Cloudflare. The domain's DNS is on Cloudflare (nameservers `frida.ns.cloudflare.com` and `max.ns.cloudflare.com`, set at Bluehost, which is the registrar of record via Network Solutions). One Worker, `worker/`, serves `site/` as static files on `tearexwoodworks.com` and `www` (which redirects to the apex, as does plain http), and runs the quote-form API. The Cloudflare account is the user's; the owner is a read-only member of it so he can see everything.

Bluehost still has the old files and is being kept for two weeks as a safety net, then cancelled. Nothing points at it any more once DNS caches expire. `Makefile`, `site/.htaccess` and the zip exist only for that window.

### Deploying

```
cd worker && npx wrangler deploy
```

That uploads changed files from `site/` and the Worker code, and it is live worldwide in seconds. No cache purge; HTML is revalidated on every request and the css/js links carry `?v=` versions. `.github/workflows/deploy.yml` does the same on every push to `main` once the repo has the `CLOUDFLARE_API_TOKEN` secret. First-time setup on a new machine: `npx wrangler login` with the Apple sign-in account.

Cache rules live in `site/_headers`; files that must not be uploaded are listed in `site/.assetsignore` (the Makefile has the equivalent list for the zip).

### Things learned the hard way

- When `routes` with `custom_domain = true` are present, Wrangler disables the workers.dev URL unless `workers_dev = true` is set. The form posts to the workers.dev URL, so it must stay on.
- Cloudflare challenges some IP addresses on the zone ("Just a moment" pages); the user's own home connection is one. Browsers pass it, tools don't. The form posts to the workers.dev hostname, which has no such filtering, so a challenge can never eat a submission. Moving the form to `/api/submit` on the main domain would need a WAF custom rule that skips Security Level for `/api/*`.
- Email Routing takes a few minutes after a destination address is verified before the `send_email` binding accepts it. The hourly retry covers that.

## Preview builds (GitHub Pages)

This is for tweaking, not for his hosting. The workflow in `.github/workflows/pages.yml` publishes `site/` to https://m00sey.github.io/tearexwoodworks/ on every push to `main`, so a change can be looked at on a real URL and a phone before it goes to Bluehost.

One-time setup after pushing the repo: Settings → Pages → Source: **GitHub Actions**. That's it. All paths in the page are relative, so it works under the `/tearexwoodworks/` subpath without any changes.

This preview still works but is no longer needed: the live site deploys in seconds and `wrangler versions upload` gives a preview URL for a change. Remove `pages.yml` when convenient.

## The quote form

The form posts to the Worker at `https://tearex-contact.tearexwoodworks.workers.dev/submit` (the same code also answers at `/api/submit` on the main domain). The Worker:

1. **Stores the request first** in a D1 (SQLite) database. From that moment it cannot be lost.
2. **Emails it** to his inbox through Cloudflare Email Routing (the `send_email` binding; `noreply@tearexwoodworks.com` to the verified destination address), with `Reply-To` set to the customer. If the email fails for any reason the row stays `pending` or `failed` and an hourly cron retries it. If `RESEND_API_KEY` is ever set, Resend is used as a fallback sender.
3. **Shows the result honestly.** With JS the page sends in the background and shows success or the specific problem in place. Without JS the browser posts directly and comes back to `/?sent=1` or `/?sent=0&why=...`. Nothing is ever reported as sent unless it was stored.

Spam control: honeypot, 3-second timing check, and a limit of 5 requests per IP per 10 minutes. Flagged requests are stored as `spam` and not emailed, but they are visible and restorable in the admin page, so a false positive is no longer a lost order. Turnstile is wired in and switches on when `data-turnstile-sitekey` on the form and the `TURNSTILE_SECRET` secret are both set.

**Admin page:** `https://tearexwoodworks.com/api/admin` (or the same path on the workers.dev host) lists every request, newest first, with its email status and a "Send now" button. `/api/admin.csv` downloads them. User `tearex`; the password is the `ADMIN_PASS` secret. `/api/health` is a public JSON status line.

Secrets (set with `cd worker && npx wrangler secret put NAME`): `MAIL_TO` (his Gmail, which must be a verified destination address in Email Routing), `ADMIN_PASS`, optional `RESEND_API_KEY` and `TURNSTILE_SECRET`. `worker/schema.sql` is applied with `npx wrangler d1 execute tearex-contact --remote --file schema.sql`.

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

**2. Form** — done. Send one test request from the live site now and then and check it arrives in his inbox and on the admin page.

**3. Put both into the site (5 min)**
1. The form needs nothing on Bluehost.
2. If the number is going on the page, add under the contact heading paragraph in `site/index.html`:
   ```html
   <p class="direct-line">Call or text <a href="tel:+1XXXXXXXXXX">(XXX) XXX-XXXX</a></p>
   ```
   The style for that line already exists.
3. Commit, push, wait a minute, hard-refresh the preview and check both the number and the form.


## Updating the live site

Edit, then `cd worker && npx wrangler deploy` (or push to `main` once the deploy workflow has its token). Bump the `?v=` on the css/js links in `site/index.html` when those files change. Replaced photos still need a new filename, since images are cached for 30 days by `site/_headers`.

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
