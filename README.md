# Tea Rex Woodworks

A single-page static site. No build step, no WordPress, no database. Open `index.html` in a browser and it works.

```
site/                     the deployable. Upload this folder's contents anywhere, as-is.
  index.html              the page
  css/site.css            styles (light and dark themes)
  js/site.js              mobile menu, gallery filters, lightbox (page works without it)
  img/                    photos as WebP, two sizes each (-700 for the grid, -1400 for full view)
  .nojekyll               tells GitHub Pages to serve the folder untouched
.github/workflows/        preview deploy of site/ to GitHub Pages (for tweaking, not his hosting)
tools/add-image.py        resizes and watermarks a photo for the gallery
tools/hero-image.py       makes the banner image, with the dark fade baked into the file
README.md                 this file
```

Everything outside `site/` is repo plumbing. Only `site/` goes to a host.

## Hosting

The domain is registered at Network Solutions and its DNS is served by Bluehost's nameservers. He's staying on Bluehost, which is Option A. Option B is there if he ever wants to stop paying for hosting.

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

When a version is ready for him, upload the contents of `site/` to Bluehost as in Option A.

## The quote form

The form posts to `contact.php` on the same domain, which sends it to his inbox through Gmail's SMTP server using his Google account and an App Password (Google account → Security → 2-Step Verification → App passwords). Gmail to Gmail, so nothing lands in spam and Bluehost's mail server, which his plan doesn't include, is never involved. If the App Password is left blank the handler falls back to PHP `mail()`, which is unreliable on Bluehost. No third-party form service, nothing that a filtering DNS can block. Spam control is a honeypot field, a 3-second timing check, and validation (real email, details at least 10 characters).

The destination address lives in `site/contact-config.php`, which is gitignored so it never lands in the repo. `contact-config.sample.php` shows the shape. The zip built from `site/` includes the real config, so a Bluehost upload has everything; a fresh clone of the repo does not, and needs the file recreated from the sample.

`.htaccess` blocks direct requests to both config files.

After a submission the handler redirects back to `/?sent=1#contact` (or `sent=0`) and the page shows a message.

Every attempt writes one line to `public_html/contact-log.txt` (blocked from the web): time, IP, outcome. `contact.php?ping=1` in a browser confirms the handler is live, the log is writable, and which transport is configured. If the App Password is ever revoked, the log shows `smtp FAILED: AUTH pass`, and a new one goes into `contact-config.php`.

The GitHub Pages preview can't run PHP, so the script disables the form there with a note. FormSubmit is no longer used.

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

**2. Form** — self-hosted in `contact.php`, nothing to set up. Test it once from the live site after upload.

**3. Put both into the site (5 min)**
1. The form needs nothing; the config ships in the zip.
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

Every gallery photo is watermarked (the banner, the CNC shop photo and the craft show photo are not): the logo laid translucently across the whole image, with "© 2026 TEA REX WOODWORKS, LLC" (the year it was stamped) through the middle, so it can't be cropped out. `tools/add-image.py` resizes, watermarks and converts in one step, so don't put photos into `site/img/` by hand.

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
