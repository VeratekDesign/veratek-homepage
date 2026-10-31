# Veratek Design website

Website for [veratekdesign.com](https://veratekdesign.com): plain HTML and CSS with no build step, plus one small Cloudflare Worker for the contact form.

```
public/              The website (served as-is)
  index.html           Home
  about-us.html        About Us
  contact-us.html      Contact Us
  css/style.css        Shared styles
  images/              Logo, favicon and photos
  _redirects           Old addresses (/home.html, *.html) → clean URLs, 301
  robots.txt           Search engine rules
  sitemap.xml          Page list for search engines
src/worker.js        Contact form handler (/api/contact)
wrangler.jsonc       Cloudflare Worker configuration
```

Pages are linked without `.html` (`/about-us`), and `https://veratekdesign.com` is the main address (see the canonical link in each page).

## Local preview

Needs [Node.js](https://nodejs.org):

```bash
cp .dev.vars.example .dev.vars
npx wrangler dev
```

Then open http://localhost:8787. Locally, contact form emails are printed to the terminal, not sent.

## Deployment

The site runs as a Cloudflare Worker with static assets. In the Cloudflare dashboard go to **Workers & Pages → Create → Import a repository**, pick this repo, and keep the default deploy command (`npx wrangler deploy`). Every push to `main` then deploys automatically. Add the custom domain under the Worker's **Settings → Domains & Routes**.

## Contact form

The form posts to `/api/contact`. The Worker:

1. Silently drops submissions that fill in the hidden "website" field (only bots do).
2. Checks the [Turnstile](https://developers.cloudflare.com/turnstile/) token, Cloudflare's free CAPTCHA alternative.
3. Emails the message to info@veratekdesign.com through [Cloudflare Email Service](https://developers.cloudflare.com/email-service/), with the visitor's address as Reply-To.

### One-time setup

1. **Email Service:** in the Cloudflare dashboard, onboard `veratekdesign.com` for sending. This adds SPF and DKIM records plus bounce records on a `cf-bounce` subdomain. If the domain already has an SPF record (for example from your mail host), merge them into one record rather than having two.
2. **Verify the recipient:** add info@veratekdesign.com as a destination address and click the link in the verification email.
3. **Turnstile:** create a widget for `veratekdesign.com` (Managed mode). Put its **site key** in `public/contact-us.html` in place of the test key `1x00000000000000000000AA`, and add its **secret key** to the Worker as a secret named `TURNSTILE_SECRET_KEY` (Worker → Settings → Variables and Secrets, type "Secret").

The recipient is fixed in `wrangler.jsonc` (`destination_address`), and the sender address is `CONTACT_FROM` there.
