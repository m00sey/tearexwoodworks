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

The form posts to [FormSubmit](https://formsubmit.co), which forwards submissions to his Gmail inbox. Nothing to install. FormSubmit's captcha is on and the form has a honeypot field.

The address is not in the HTML. `site/js/site.js` assembles the endpoint at runtime (`FORM_ENDPOINT`) so it isn't sitting in the page source for scrapers. Two steps to finish it off:

1. **Activate.** The first real submission triggers a one-time activation email to the Gmail address. Click the link.
2. **Swap in the random endpoint.** After activation, FormSubmit provides a random string that can be used in place of the email (it's in the activation flow, and under "Random-like string" in their docs). Set `FORM_ENDPOINT` in `site/js/site.js` to `https://formsubmit.co/<that string>`. Now the address appears nowhere in the site.

If you'd rather not depend on a third party, Bluehost runs PHP, so a small mail handler is the next step up.

## Contact details on the page

There is no email address or phone number visible on the page on purpose. The form is the only way in. Reasons and what to do when that changes:

- **Phone.** His cell was on the old site. It's been removed pending a Google Voice number (free, forwards to his cell, can be dropped if abused). When there is one, add a line under the contact heading in `site/index.html` and a `tel:` link in the footer.
- **Email.** Publishing it in a `mailto:` link is what fills an inbox with spam. If he wants it visible anyway, put it in as text with the `@` spelled out, not as a link.

## Adding a piece to the gallery

1. Export the photo, then make two WebP copies:
   ```
   cwebp -q 80 -resize 700 0 photo.jpg -o site/img/name-700.webp
   cwebp -q 80 -resize 1400 0 photo.jpg -o site/img/name-1400.webp
   ```
   (`brew install webp` gives you `cwebp`. Any image tool that outputs WebP or JPEG is fine too.)
2. Copy one of the `<figure class="piece">` blocks in `site/index.html`, change the two image paths, the `alt` text, the title and the tag.
3. Set `data-kind` to `wildlife`, `signs`, `portraits` or `art` so the filter buttons pick it up.

## Copy to confirm with the owner

The old site's contact block still had WordPress template placeholders (123 Craft Lane, (123) 456-7890). Those are gone. The following is written from the photos and the area code on the old site and should be checked:

- "Southeastern Pennsylvania" / "near Philadelphia" for location (hero, workshop section, footer).
- The wood species list in the shop section (cherry, walnut, mahogany, oak).
- "Pickup or ship" and the turnaround wording in How it works.
- The size line in the workshop facts. Replacing "up to the size of the CNC bed" with the actual bed size (for example "up to 24 x 48 in") is more useful to a customer.
- Gallery titles. Adding wood species and size to each caption (for example "Walnut, 8 x 30 in") would make the gallery stronger.
- Social links. The old site's Facebook/Instagram links were empty placeholders, so none are included. Add real ones to the footer if he has them.
