# Veratek Design website

Static site for [veratekdesign.com](https://www.veratekdesign.com) — plain HTML and CSS, no build step.

```
index.html        Home
about-us.html     About Us
contact-us.html   Contact Us
css/style.css     Shared styles
images/           Logo and photos
_redirects        Cloudflare Pages redirects (old /home.html → /)
```

## Local preview

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Deployment

Hosted on Cloudflare Pages, connected to this GitHub repository. Every push to `main` deploys automatically.

Cloudflare Pages settings:

- Framework preset: None
- Build command: *(leave empty)*
- Build output directory: `/`

## Contact form

There is no server backend. Submitting the form opens the visitor's email app with a message to info@veratekdesign.com already filled in.
