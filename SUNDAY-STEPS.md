# Sunday steps

Two parts. **Part 1** gets the quote form working again this weekend without touching hosting or DNS.
**Part 2** is the longer move off Bluehost onto Cloudflare proper, which removes cPanel, PHP, the zip
uploads and the Resend account.

**Open blocker (evening of 25 Oct):** Cloudflare's edge still routes `tearexwoodworks.com` to Bluehost.
Bluehost's "Cloudflare" was a Cloudflare for SaaS custom hostname in Bluehost's account, and the edge gives
that priority over the same hostname in our free zone. Evidence: requests to the domain never reach the
Worker (logs), responses carry Apache 404s and Bluehost's cache, and the certificate served was issued on
13 Sep (Bluehost's), not today's. Our DNS is correct (both `Worker` rows present). Fix: Bluehost must
remove the hostname from their CDN integration (support chat; wording in the chat log), or Cloudflare
expires it itself about a week after DNS stopped pointing at Bluehost. Until then: the site works via
Bluehost (new page uploaded, `bluehost/contact.php` (uploaded to public_html) forwards the old form POST to the Worker), the form and
admin page work on the workers.dev host, our Web Analytics sees nothing, and changes must be uploaded to
Bluehost as well as deployed. Re-test with `curl -sI https://tearexwoodworks.com/api/health` from a
connection Bluehost doesn't challenge, or check the certificate date: `echo | openssl s_client -connect
tearexwoodworks.com:443 -servername tearexwoodworks.com | openssl x509 -noout -dates`.

**Status, evening of 25 Oct 2026: Part 2 is done on our side.** The domain is on Cloudflare, the Worker serves the
site and the form, Email Routing delivers to his Gmail (tested end to end, reply address correct), and
he is a read-only member of the account. Part 1 is superseded; only these loose ends remain:

- Bluehost: upload the zip anyway for visitors with stale DNS during the first day, delete the two PHP
  files there, then cancel the plan after two weeks.
- Web Analytics: Analytics & Logs → Web Analytics → enable for the zone.
- Turnstile keys (optional), GitHub `CLOUDFLARE_API_TOKEN` (optional), revoke the old Gmail App Password.
- Phone check: `http://tearexwoodworks.com` and `www.tearexwoodworks.com` both land on the https apex.

The form keeps posting to the workers.dev URL on purpose: that hostname has no Cloudflare security
filtering in front of it, so a challenge page can never swallow a submission. See the README.

Everything below is kept as the record of what was done and why.

- Form endpoint: https://tearex-contact.tearexwoodworks.workers.dev/submit
- Admin page: https://tearex-contact.tearexwoodworks.workers.dev/admin (user `tearex`)
- Health: https://tearex-contact.tearexwoodworks.workers.dev/health

---

## Part 1 — fix the form now (about an hour)

Everything here is done from your own accounts. Nothing commits us to them; see Part 2 for moving to his.

### 1. Save the old form's evidence (5 min)

Before anything is overwritten, grab the log the PHP handler was writing.

1. Bluehost → cPanel → File Manager → `public_html`.
2. Download `contact-log.txt`. One line per attempt: time, IP, outcome.
3. Look for `smtp FAILED`, `dropped:` lines with real names on them, or reported submissions with no
   line at all. That tells us which of the three failure modes was eating orders. Keep the file.

### 2. Resend account: this is what sends the email (20 min)

Resend is the service the Worker hands each quote request to for delivery. It replaces the Gmail
App Password. Free tier is 3,000 emails a month.

1. Sign up at https://resend.com (free). Any email address; this is an admin login, not the sending address.
2. Domains → Add domain → `tearexwoodworks.com`. Region: US East.
3. It shows 2–3 DNS records (TXT for SPF/verification and a CNAME or TXT for DKIM). Leave that tab open.
4. In another tab: Bluehost → cPanel → **Zone Editor** → `tearexwoodworks.com` → Manage.
   Add each record exactly as Resend shows it. Host names: Bluehost may want the short form
   (`resend._domainkey`) rather than the full one (`resend._domainkey.tearexwoodworks.com`); if one
   is rejected, try the other. TTL can stay at default.
5. Back in Resend, click Verify. Usually a few minutes, sometimes up to an hour. Move on and come back.
6. Resend → API Keys → Create. Name `tearex-contact`, permission **Sending access**, domain
   `tearexwoodworks.com`. Copy the key; it is shown once.
7. In the repo:
   ```
   cd worker
   npx wrangler secret put RESEND_API_KEY     # paste the key when prompted
   ```
   No redeploy needed. The hourly cron will also pick up anything that queued while the key was missing.

Check: open the health URL above. `email_configured` should now be `true`.

### 3. Upload the site to Bluehost (10 min)

1. In the repo, `make zip` (already built once; rebuild if you changed anything).
2. cPanel → File Manager → `public_html`. Upload `dist/tearexwoodworks-site.zip`, right-click → Extract,
   then delete the zip.
3. Delete `public_html/contact.php` and `public_html/contact-config.php`. They are no longer used and
   the config file holds his Gmail App Password. (`contact-config.sample.php` too if it is there.)
4. If the page looks stale: cPanel → Cloudflare → Purge Everything. `index.html` is sent with
   `no-cache` so it usually isn't needed.

### 4. Test it end to end (5 min)

1. On your phone, on mobile data (not your home network), open https://tearexwoodworks.com/#contact
   and send a real request with your own email address.
2. You should see "Sent." in place, without the page reloading.
3. Open the admin page: the row should be there with a green **emailed** badge.
4. His inbox should have "Quote request from … (#N)". Reply to it and confirm the reply goes to you.
5. Also try one with a bad email address: the page should say so in place.

If step 3 shows the row but with a `failed` badge, the error text under it says why (almost always
"domain not verified" if Resend is still checking DNS). Press **Send now** on the row once it is.

### 5. Revoke the old credentials (5 min)

The old handler logged into his Gmail with an App Password. It is no longer needed.

1. His Google account → Security → 2-Step Verification → App passwords → delete the website one.
2. Delete your local `site/contact-config.php`.

### 6. Analytics (10 min)

Cloudflare Web Analytics: free, no cookies, so no consent banner, works on Bluehost as-is.

1. Cloudflare dashboard (your account) → Analytics & Logs → Web Analytics → Add a site →
   hostname `tearexwoodworks.com`, and choose the manual JS snippet.
2. Copy the snippet's `token` value and tell me, or paste the whole `<script>` tag into
   `site/index.html` just above `</body>`. It needs to go on every page, and there is only one.
3. Re-zip, re-upload. Numbers appear after a day or so.

This gives visitors, page views, referrers, countries and page speed. It does not do custom events
(form submits, gallery clicks). If he wants those later, Umami Cloud's free tier does, and it's one
more script tag.

### 7. Hand him the keys

- Admin page URL and password (the `ADMIN_PASS` secret; it was shown once in chat when created).
  Bookmark it on his phone; it works well there.
- Tell him: every request is on that page even if an email ever goes missing, and there is a CSV download.

### 8. Commit

`git add -A && git commit` the repo so the Worker source, the site changes and this file are saved.

---

## Part 2 — long term: everything on Cloudflare, cancel Bluehost

### Why

- cPanel exposes almost none of Cloudflare's controls, so we can't see or change the challenge that
  was probably breaking the form, and we can't put anything on the real domain except via PHP and FTP.
- Deploys are zip uploads and cache purges by hand. On Cloudflare a deploy is one command, or
  automatic on push.
- With the domain's DNS on Cloudflare, the Worker can send email through Cloudflare Email Routing
  directly. No Resend, no third-party API key.
- Cost drops from the Bluehost plan to $0. The domain renewal at Network Solutions stays as it is,
  or moves to Cloudflare Registrar at cost (optional).

### Target shape

One Worker serves both the static site and the form API on the real domain. Cloudflare calls this
"Workers with static assets", and it supersedes Pages for new projects.

```
tearexwoodworks.com/            static files from site/  (served by the Worker's assets binding)
tearexwoodworks.com/api/submit  the form handler        (the code already in worker/)
tearexwoodworks.com/api/admin   the admin page
```

Same-origin, so no CORS, nothing for a filtering DNS to block, and the admin page lives on the real
domain. Spam gets Cloudflare Turnstile on top of the honeypot and rate limit. (Turnstile works on any
domain, so it could be added during Part 1 if spam becomes a problem before the move.)

### What happens to the static site

The `site/` folder is unchanged. On deploy, Wrangler uploads it to Cloudflare's edge and the Worker
serves it directly: requests under `/api/` run the form code, everything else is a plain cached file.
`.htaccess` goes away because there is no Apache; its two jobs (HTTPS redirect, cache headers) become
a Cloudflare setting and a small `_headers` file.

### Future server-side features

Cloudflare does not run PHP and we don't need it. Anything dynamic he asks for later (a quote
calculator, a database-backed gallery, a protected page, order intake) goes into the same Worker as
JavaScript, with D1 as the database and the admin page as the pattern to copy. Third-party embeds
(Square, Etsy, Calendly) drop into the static page when a hosted product fits better.

### Whose account

Decide this before the DNS move, because the zone, the Worker, the database and the analytics all
live in whichever account adds the domain. Decision: **your account, with him as a member.**

Cloudflare free accounts support multiple members (Manage Account → Members → Invite). He signs up
with his own email and password; nothing is shared. Invite him as **Administrator Read Only**: he can
see everything, including DNS, the Worker, the database and the analytics, and change nothing. If he
ever wants ownership, promote him to Super Administrator and remove yourself; nothing has to move.

Two caveats: roles apply to the whole account, not per domain, so keep this account for his site
only; and the account email and billing contact stay yours, which is fine on the free plan.

### Steps

**A. Prepare (no downtime, do any time)**

1. Cloudflare dashboard → **Connect a domain** → `tearexwoodworks.com` → Free. Choose the full
   (nameserver) setup, not the CNAME one. It copies the DNS records from Bluehost. **Check for MX
   records** before continuing; keep any you see. Stop at the nameserver screen; don't change
   anything at Network Solutions yet.
2. Manage Account → Members → Invite him, role Administrator Read Only. He accepts from his shop Gmail.
3. Turnstile → Add widget → hostname `tearexwoodworks.com`, Managed. Give me the site key and secret:
   the site key goes in `data-turnstile-sitekey` on the form in `site/index.html`, the secret in
   `npx wrangler secret put TURNSTILE_SECRET`. Until both are set the form works without it.
4. Upload the zip to Bluehost (Part 1, step 3) so the form works on the current hosting through the
   whole migration. Resend (Part 1, step 2) so email goes out today; add its DNS records in the new
   Cloudflare zone, not Bluehost, so they survive the move.
5. For deploy-on-push: My Profile → API Tokens → Create → template "Edit Cloudflare Workers", add
   D1 → Edit. Put it in the GitHub repo as the Actions secret `CLOUDFLARE_API_TOKEN`.

**B. Repo changes — done (25 Oct)**

The Worker now serves `site/` as static assets and the form API at `/api/*` (the bare `/submit`
paths still work for the Bluehost copy). It has the `www` → apex redirect, cache headers in
`site/_headers`, an upload exclusion list in `site/.assetsignore`, Turnstile verification that
activates when the keys exist, Email Routing as a sender once its binding is enabled, and
`.github/workflows/deploy.yml` for deploy on push. All tested on
https://tearex-contact.tearexwoodworks.workers.dev, which is the full site.

**C. Cutover (10 minutes, then wait)**

1. In `worker/wrangler.toml`, uncomment the `routes` block (the two custom domains) and deploy.
   Cloudflare writes the DNS records for the apex and `www` itself. If the zone isn't active yet the
   deploy will say so; it still works once it is, so just re-run it then.
2. Network Solutions → the domain → Nameservers → replace Bluehost's two with Cloudflare's two.
3. Wait for Cloudflare's "zone is active" email (minutes to 24 h). During propagation old resolvers
   reach Bluehost and new ones reach Cloudflare; both serve the working site and the working form.
4. Once active, in the dashboard: SSL/TLS → Overview → **Full (strict)**; SSL/TLS → Edge Certificates →
   Always Use HTTPS on; Analytics & Logs → Web Analytics → enable for the zone (one click, no snippet).
5. Email → Email Routing → enable, add his Gmail as a destination address (he confirms), then in
   `worker/wrangler.toml` uncomment the `[[send_email]]` block and deploy. `/api/health` should show
   `"sender":"email-routing+resend"`. Send a test request; it should now arrive via Cloudflare.
6. Change the form's `action` in `site/index.html` from the workers.dev URL to `/api/submit` and
   deploy. Same-origin from here on.
7. Test from a phone on mobile data: the site, the form, his inbox, the admin page at
   https://tearexwoodworks.com/api/admin.

**D. Afterwards**

1. Leave Bluehost running for two weeks as a safety net, then cancel the hosting plan.
2. Delete the Resend domain and API key once a few real requests have gone through Email Routing,
   or keep it as the fallback; it costs nothing.
3. Remove `.github/workflows/pages.yml`, `Makefile`, `site/.htaccess`, `site/.nojekyll` and the
   Bluehost sections of the README.
4. Optional: transfer the domain from Network Solutions to Cloudflare Registrar (Domain Registration →
   Transfer). Needs the domain unlocked and an auth code; 5–7 days; renewals at cost.

### Rough effort

| | Who | Time |
|---|---|---|
| A. Prepare | you, with him for the account and the email confirmation | 30 min |
| B. Repo changes | me | done |
| C. Cutover | you at Network Solutions, then waiting | 15 min, plus propagation |
| D. Cleanup | you | 15 min, two weeks later |
