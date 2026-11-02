// Veratek Design website Worker.
// Static pages are served from public/ automatically; this script only runs for
// requests that don't match a file, which is how /api/contact reaches it.

// Also rejects characters that could break out of an email header (<>",;).
const EMAIL_PATTERN = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/;
const MAX_LENGTH = { name: 200, email: 200, subject: 300, message: 5000 };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/contact" && request.method === "POST") {
      return handleContact(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};

async function handleContact(request, env) {
  let form;
  try {
    form = await request.formData();
  } catch {
    return reply(400, "Invalid form submission.");
  }

  // Honeypot: the "website" field is hidden from people, so only bots fill it in.
  // Pretend it worked so they don't retry.
  if (form.get("website")) return reply(200);

  const fields = {};
  for (const key of Object.keys(MAX_LENGTH)) {
    fields[key] = String(form.get(key) || "").trim();
    if (!fields[key]) return reply(400, "Please fill in all required fields.");
    if (fields[key].length > MAX_LENGTH[key]) return reply(400, `The ${key} field is too long.`);
  }
  if (!EMAIL_PATTERN.test(fields.email)) return reply(400, "Please enter a valid email address.");
  // Name and subject are single-line fields; flatten any line breaks a bot sends.
  fields.name = fields.name.replace(/\s+/g, " ");
  fields.subject = fields.subject.replace(/\s+/g, " ");

  const human = await verifyTurnstile(form.get("cf-turnstile-response"), request, env);
  if (!human) return reply(400, "Spam check failed. Please reload the page and try again.");

  const mime = buildMessage({
    from: `${encodeHeader("Veratek Design Website")} <${env.CONTACT_FROM}>`,
    to: env.CONTACT_TO,
    // Gmail hides a sender's own copy of a message sent to a group they're in,
    // so copy the sending account directly to land in its inbox too.
    cc: env.GMAIL_SENDER,
    replyTo: `${encodeHeader(fields.name)} <${fields.email}>`,
    subject: encodeHeader(`Website contact: ${fields.subject}`),
    text:
      `Name: ${fields.name}\n` +
      `Email: ${fields.email}\n` +
      `Subject: ${fields.subject}\n\n` +
      `${fields.message}\n`,
  });

  try {
    await sendWithGmail(mime, env);
  } catch (err) {
    console.error("Email send failed", err.message);
    return reply(500, "Sorry, your message could not be sent. Please email us directly.");
  }

  return reply(200);
}

// --- Sending through Google Workspace (Gmail API) ---
// A Google Cloud service account, allowed in Google Admin (domain-wide delegation)
// to use only the gmail.send scope, sends the message as GMAIL_SENDER.
// It can send mail but can't read any.

async function sendWithGmail(mime, env) {
  const token = await getGoogleAccessToken(env);
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: base64url(utf8(mime)) }),
  });
  if (!res.ok) throw new Error(`Gmail API ${res.status}: ${await res.text()}`);
}

// Exchanges a signed token (JWT) from the service account for a short-lived access token.
async function getGoogleAccessToken(env) {
  const account = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: account.client_email,
    sub: env.GMAIL_SENDER,
    scope: "https://www.googleapis.com/auth/gmail.send",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${base64url(utf8(JSON.stringify(header)))}.${base64url(utf8(JSON.stringify(claims)))}`;

  const pem = account.private_key.replace(/-----[^-]+-----|\s/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, utf8(unsigned));

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${base64url(new Uint8Array(signature))}`,
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Google token ${res.status}: ${JSON.stringify(data)}`);
  return data.access_token;
}

// Plain-text email in MIME format. The body is base64 so any language's characters survive.
function buildMessage({ from, to, cc, replyTo, subject, text }) {
  const body = base64(utf8(text)).replace(/.{76}/g, "$&\r\n");
  return [
    `From: ${from}`,
    `To: ${to}`,
    `Cc: ${cc}`,
    `Reply-To: ${replyTo}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    body,
  ].join("\r\n");
}

// Encodes visitor-supplied text for an email header (RFC 2047), so it can't add extra headers.
// Long values are split into several encoded words on folded lines to stay under line limits.
function encodeHeader(value) {
  const chars = Array.from(value);
  const words = [];
  for (let i = 0; i < chars.length; i += 30) {
    words.push(`=?UTF-8?B?${base64(utf8(chars.slice(i, i + 30).join("")))}?=`);
  }
  return words.join("\r\n ");
}

function utf8(text) {
  return new TextEncoder().encode(text);
}

function base64(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64url(bytes) {
  return base64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function verifyTurnstile(token, request, env) {
  if (!token) return false;
  const body = new FormData();
  body.append("secret", env.TURNSTILE_SECRET_KEY);
  body.append("response", token);
  body.append("remoteip", request.headers.get("CF-Connecting-IP") || "");
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body,
  });
  const result = await res.json();
  return result.success === true;
}

function reply(status, error) {
  return Response.json(error ? { ok: false, error } : { ok: true }, { status });
}
