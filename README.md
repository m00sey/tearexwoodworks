# Tea Rex Woodworks

A single-page static site. No build step, no WordPress, no database. Open `index.html` in a browser and it works.

```
index.html      the page
css/site.css    styles (light and dark themes)
js/site.js      mobile menu, gallery filters, lightbox (page works without it)
img/            photos as WebP, two sizes each (-700 for the grid, -1400 for full view)
```

## Hosting (free)

Any of these serve a folder of static files for free with HTTPS. Cloudflare Pages is the best fit since the domain already sits on Cloudflare.

**Cloudflare Pages**
1. Push this folder to a GitHub repo (or use "Direct upload" in the Pages dashboard and drag the folder in).
2. Cloudflare dashboard → Workers & Pages → Create → Pages. Build command: none. Output directory: `/`.
3. Custom domains → add `tearexwoodworks.com` and `www`. Since DNS is already on Cloudflare it wires itself up.

**Netlify**: drag the folder onto app.netlify.com/drop. Add the domain under Domain settings.

**GitHub Pages**: push to a repo, Settings → Pages → deploy from `main`, root. Point the domain at GitHub's IPs.

After it's live, cancel the Bluehost/WordPress plan.

## The quote form

The form posts to [FormSubmit](https://formsubmit.co), which forwards submissions to `tearexwoodworks@gmail.com`. Nothing to install. The first time someone submits, FormSubmit sends a one-time activation email to that Gmail address. Click the link once and every submission after that lands in the inbox.

If you'd rather not depend on a third party, delete the `<form>` and keep the email and phone links. They work anywhere.

## Adding a piece to the gallery

1. Export the photo, then make two WebP copies:
   ```
   cwebp -q 80 -resize 700 0 photo.jpg -o img/name-700.webp
   cwebp -q 80 -resize 1400 0 photo.jpg -o img/name-1400.webp
   ```
   (`brew install webp` gives you `cwebp`. Any image tool that outputs WebP or JPEG is fine too.)
2. Copy one of the `<figure class="piece">` blocks in `index.html`, change the two image paths, the `alt` text, the title and the tag.
3. Set `data-kind` to `wildlife`, `signs`, `portraits` or `art` so the filter buttons pick it up.

## Copy to confirm with the owner

The old site's contact block still had WordPress template placeholders (123 Craft Lane, (123) 456-7890). Those are gone. The following is written from the photos and the 610 area code and should be checked:

- "Southeastern Pennsylvania" / "near Philadelphia" for location (hero, shop section, footer).
- The wood species list in the shop section (cherry, walnut, mahogany, oak).
- "Pickup or ship" and the turnaround wording in How it works.
- Gallery titles. Adding wood species and size to each caption (for example "Walnut, 8 x 30 in") would make the gallery stronger.
- Social links. The old site's Facebook/Instagram links were empty placeholders, so none are included. Add real ones to the footer if he has them.
