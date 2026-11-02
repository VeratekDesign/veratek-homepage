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
3. Emails the message to info@veratekdesign.com (a Google Group) through **Google Workspace**, using the [Gmail API](https://developers.google.com/workspace/gmail/api/guides/sending), with the visitor's address as Reply-To.

Sending uses a Google Cloud **service account** that Google Admin allows to use only the `gmail.send` scope, acting as `GMAIL_SENDER`. It can send mail but can't read any mailbox. No paid Cloudflare email product is needed.

Addresses are set in `wrangler.jsonc`:
- `CONTACT_TO`: the recipient.
- `GMAIL_SENDER`: the Workspace user the form sends as.
- `CONTACT_FROM`: the From address, which must be that user or one of its "Send mail as" aliases.

### One-time setup

1. **Turnstile:** create a widget for `veratekdesign.com` (Managed mode). Put its **site key** in `public/contact-us.html`, and add its **secret key** to the Worker as a secret named `TURNSTILE_SECRET_KEY` (Worker → Settings → Variables and Secrets, type "Secret").
2. **Google Cloud:** in the Google Cloud console, create a project, enable the **Gmail API**, then create a **service account** and download a **JSON key** for it.
3. **Google Admin → Security → Access and data control → API controls → Domain-wide delegation:** add the service account's **Client ID** with the single scope `https://www.googleapis.com/auth/gmail.send`.
4. **From address:** add `website@veratekdesign.com` as an alias of the `GMAIL_SENDER` user in Google Admin. Then, in that user's Gmail, add it under **Settings → Accounts → Send mail as**.
5. **Worker secret:** paste the entire JSON key file as a secret named `GOOGLE_SERVICE_ACCOUNT`, then delete the downloaded file.
