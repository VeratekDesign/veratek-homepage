// Veratek Design website Worker.
// Static pages are served from public/ automatically; this script only runs for
// requests that don't match a file, which is how /api/contact reaches it.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
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

  const human = await verifyTurnstile(form.get("cf-turnstile-response"), request, env);
  if (!human) return reply(400, "Spam check failed. Please reload the page and try again.");

  try {
    await env.EMAIL.send({
      to: env.CONTACT_TO,
      from: { email: env.CONTACT_FROM, name: "Veratek Design Website" },
      replyTo: { email: fields.email, name: fields.name },
      subject: `Website contact: ${fields.subject}`,
      text:
        `Name: ${fields.name}\n` +
        `Email: ${fields.email}\n` +
        `Subject: ${fields.subject}\n\n` +
        `${fields.message}\n`,
    });
  } catch (err) {
    console.error("Email send failed", err.code, err.message);
    return reply(500, "Sorry, your message could not be sent. Please email us directly.");
  }

  return reply(200);
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
