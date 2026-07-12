const path = require("path");
const fs = require("fs");
const https = require("https");
const crypto = require("crypto");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const useSupabase = !!(supabaseUrl && supabaseKey);

// File-based fallback (local dev only)
const DB_DIR = path.join(__dirname, "..", "data");
if (!useSupabase) {
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
}
const USERS_FILE = path.join(DB_DIR, "users.json");
const PARTIES_FILE = path.join(DB_DIR, "parties.json");

function readJSON(file) { try { return JSON.parse(fs.readFileSync(file, "utf-8")); } catch { return []; } }
function writeJSON(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

// --- Supabase REST helpers ---
function supabaseRequest(method, table, options = {}) {
  return new Promise((resolve, reject) => {
    let url = `${supabaseUrl}/rest/v1/${table}`;
    if (options.query) url += "?" + new URLSearchParams(options.query).toString();
    if (options.id) url += `?id=eq.${encodeURIComponent(options.id)}`;

    const headers = {
      "apikey": supabaseKey,
      "Authorization": `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
      "Prefer": options.returnMinimal ? "return=minimal" : "return=representation",
    };

    const parsed = new URL(url);
    const opts = { method, headers, hostname: parsed.hostname, path: parsed.pathname + parsed.search };
    if (options.body) {
      const bodyStr = JSON.stringify(options.body);
      headers["Content-Length"] = Buffer.byteLength(bodyStr);
      opts.headers = headers;
    }
    const req = https.request(opts, res => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try { resolve(data ? JSON.parse(data) : null); } catch { resolve(null); }
      });
    });
    req.on("error", reject);
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

async function supabaseSelect(table, query) {
  const rows = await supabaseRequest("GET", table, { query: { select: "*", ...query } });
  return Array.isArray(rows) ? rows : (rows ? [rows] : []);
}

async function supabaseSelectOne(table, query) {
  const rows = await supabaseSelect(table, query);
  return rows.length > 0 ? rows[0] : null;
}

async function supabaseInsert(table, row) {
  const rows = await supabaseRequest("POST", table, { body: row });
  return Array.isArray(rows) ? rows[0] : rows;
}

async function supabaseUpdate(table, id, updates) {
  await supabaseRequest("PATCH", table, { id, body: updates, returnMinimal: true });
}

async function supabaseDelete(table, id) {
  await supabaseRequest("DELETE", table, { id, returnMinimal: true });
}

// --- Users ---
async function findUserByEmail(email) {
  if (useSupabase) return supabaseSelectOne("users", { email: `eq.${email.toLowerCase()}` });
  return readJSON(USERS_FILE).find(u => u.email === email.toLowerCase()) || null;
}

async function findUserByGoogleId(googleId) {
  if (useSupabase) return supabaseSelectOne("users", { google_id: `eq.${googleId}` });
  return readJSON(USERS_FILE).find(u => u.google_id === googleId) || null;
}

async function createUser(user) {
  if (useSupabase) {
    return supabaseInsert("users", {
      email: user.email, password: user.password, name: user.name, google_id: user.googleId || null,
    });
  }
  const users = readJSON(USERS_FILE);
  const u = { id: crypto.randomUUID(), email: user.email, password: user.password, name: user.name, google_id: user.googleId || null, created_at: new Date().toISOString() };
  users.push(u); writeJSON(USERS_FILE, users);
  return u;
}

async function updateUserGoogleId(id, googleId) {
  if (useSupabase) { await supabaseUpdate("users", id, { google_id: googleId }); return; }
  const users = readJSON(USERS_FILE); const u = users.find(u => u.id === id);
  if (u) { u.google_id = googleId; writeJSON(USERS_FILE, users); }
}

async function getUserById(id) {
  if (useSupabase) return supabaseSelectOne("users", { id: `eq.${id}` });
  return readJSON(USERS_FILE).find(u => u.id === id) || null;
}

// --- Parties ---
async function getPartiesByUser(userId) {
  if (useSupabase) {
    return supabaseSelect("parties", { user_id: `eq.${userId}`, order: "created_at.desc" });
  }
  return readJSON(PARTIES_FILE).filter(p => p.user_id === userId).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

async function getPartyBySlug(slug) {
  if (useSupabase) return supabaseSelectOne("parties", { slug: `eq.${slug}` });
  return readJSON(PARTIES_FILE).find(p => p.slug === slug) || null;
}

async function createParty(party) {
  if (useSupabase) {
    return supabaseInsert("parties", {
      id: party.id, slug: party.slug, user_id: party.userId,
      dog1_name: party.dog1Name, dog2_name: party.dog2Name,
      guesses: [], answers: null, revealed: false, created_at: party.createdAt,
    });
  }
  const parties = readJSON(PARTIES_FILE);
  const p = { id: party.id, slug: party.slug, user_id: party.userId, dog1_name: party.dog1Name, dog2_name: party.dog2Name, guesses: [], answers: null, revealed: false, created_at: party.createdAt };
  parties.push(p); writeJSON(PARTIES_FILE, parties);
  return p;
}

async function deleteParty(slug) {
  const p = await getPartyBySlug(slug);
  if (useSupabase) { if (p) await supabaseDelete("parties", p.id); return; }
  let parties = readJSON(PARTIES_FILE); parties = parties.filter(x => x.slug !== slug);
  writeJSON(PARTIES_FILE, parties);
}

async function getPartyData(slug) {
  if (useSupabase) {
    const p = await supabaseSelectOne("parties", { slug: `eq.${slug}`, select: "guesses,answers,revealed" });
    if (!p) return null;
    return { guesses: p.guesses || [], answers: p.answers, revealed: p.revealed || false };
  }
  const p = readJSON(PARTIES_FILE).find(x => x.slug === slug);
  if (!p) return null;
  return { guesses: p.guesses || [], answers: p.answers, revealed: p.revealed || false };
}

async function updatePartyGuesses(slug, guesses) {
  if (useSupabase) { const p = await getPartyBySlug(slug); if (p) await supabaseUpdate("parties", p.id, { guesses }); return; }
  const parties = readJSON(PARTIES_FILE); const p = parties.find(x => x.slug === slug);
  if (p) { p.guesses = guesses; writeJSON(PARTIES_FILE, parties); }
}

async function updatePartyAnswers(slug, answers) {
  if (useSupabase) { const p = await getPartyBySlug(slug); if (p) await supabaseUpdate("parties", p.id, { answers, revealed: false }); return; }
  const parties = readJSON(PARTIES_FILE); const p = parties.find(x => x.slug === slug);
  if (p) { p.answers = answers; p.revealed = false; writeJSON(PARTIES_FILE, parties); }
}

async function updatePartyReveal(slug, guesses) {
  if (useSupabase) { const p = await getPartyBySlug(slug); if (p) await supabaseUpdate("parties", p.id, { guesses, revealed: true }); return; }
  const parties = readJSON(PARTIES_FILE); const p = parties.find(x => x.slug === slug);
  if (p) { p.guesses = guesses; p.revealed = true; writeJSON(PARTIES_FILE, parties); }
}

module.exports = {
  findUserByEmail, findUserByGoogleId, createUser, updateUserGoogleId, getUserById,
  getPartiesByUser, getPartyBySlug, createParty, deleteParty,
  getPartyData, updatePartyGuesses, updatePartyAnswers, updatePartyReveal,
};
