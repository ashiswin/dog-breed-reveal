const path = require("path");
const fs = require("fs");
const https = require("https");
const crypto = require("crypto");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const useSupabase = !!(supabaseUrl && supabaseKey);

const DB_DIR = path.join(__dirname, "..", "data");
if (!useSupabase && !fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
const USERS_FILE = path.join(DB_DIR, "users.json");
const PARTIES_FILE = path.join(DB_DIR, "parties.json");

function readJSON(file) { try { return JSON.parse(fs.readFileSync(file, "utf-8")); } catch { return []; } }
function writeJSON(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

function supabaseRequest(method, table, options = {}) {
  return new Promise((resolve, reject) => {
    const url = `${supabaseUrl}/rest/v1/${table}`;
    const parsed = new URL(url);
    const qs = options.query ? "?" + new URLSearchParams(options.query).toString() : "";
    const idPath = options.id ? `?id=eq.${encodeURIComponent(options.id)}` : "";
    const path = parsed.pathname + (options.id ? idPath : qs);

    const headers = {
      "apikey": supabaseKey,
      "Authorization": `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
      "Prefer": options.returnMinimal ? "return=minimal" : "return=representation",
    };

    const body = options.body ? JSON.stringify(options.body) : null;
    if (body) headers["Content-Length"] = Buffer.byteLength(body);

    const req = https.request({
      method,
      hostname: parsed.hostname,
      path,
      headers,
    }, res => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => {
        if (res.statusCode >= 400) {
          reject(new Error(`Supabase ${res.statusCode}: ${d}`));
          return;
        }
        try { resolve(d ? JSON.parse(d) : null); } catch { resolve(null); }
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function supabaseSelect(table, query) { const rows = await supabaseRequest("GET", table, { query: { select: "*", ...query } }); return Array.isArray(rows) ? rows : (rows ? [rows] : []); }
async function supabaseSelectOne(table, query) { const rows = await supabaseSelect(table, query); return rows[0] || null; }
async function supabaseInsert(table, row) { const rows = await supabaseRequest("POST", table, { body: row }); return Array.isArray(rows) ? rows[0] : rows; }
async function supabaseUpdate(table, id, updates) { await supabaseRequest("PATCH", table, { id, body: updates, returnMinimal: true }); }
async function supabaseDelete(table, id) { await supabaseRequest("DELETE", table, { id, returnMinimal: true }); }

async function findUserByEmail(email) { return useSupabase ? supabaseSelectOne("users", { email: `eq.${email.toLowerCase()}` }) : (readJSON(USERS_FILE).find(u => u.email === email.toLowerCase()) || null); }
async function findUserByGoogleId(googleId) { return useSupabase ? supabaseSelectOne("users", { google_id: `eq.${googleId}` }) : (readJSON(USERS_FILE).find(u => u.google_id === googleId) || null); }
async function createUser(user) {
  if (useSupabase) return supabaseInsert("users", { email: user.email, password: user.password, name: user.name, google_id: user.googleId || null });
  const users = readJSON(USERS_FILE); const u = { id: crypto.randomUUID(), email: user.email, password: user.password, name: user.name, google_id: user.googleId || null, created_at: new Date().toISOString() }; users.push(u); writeJSON(USERS_FILE, users); return u;
}
async function updateUserGoogleId(id, googleId) { if (useSupabase) { await supabaseUpdate("users", id, { google_id: googleId }); return; } const users = readJSON(USERS_FILE); const u = users.find(u => u.id === id); if (u) { u.google_id = googleId; writeJSON(USERS_FILE, users); } }
async function getUserById(id) { return useSupabase ? supabaseSelectOne("users", { id: `eq.${id}` }) : (readJSON(USERS_FILE).find(u => u.id === id) || null); }

async function getPartiesByUser(userId) { return useSupabase ? supabaseSelect("parties", { select: "id,slug,user_id,dogs,guesses,answers,revealed,created_at", user_id: `eq.${userId}`, order: "created_at.desc" }) : readJSON(PARTIES_FILE).filter(p => p.user_id === userId).sort((a,b) => new Date(b.created_at)-new Date(a.created_at)); }
async function getPartyBySlug(slug) { return useSupabase ? supabaseSelectOne("parties", { select: "id,slug,user_id,dogs,guesses,answers,revealed,created_at", slug: `eq.${slug}` }) : (readJSON(PARTIES_FILE).find(p => p.slug === slug) || null); }

async function createParty(party) {
  if (useSupabase) return supabaseInsert("parties", { id: party.id, slug: party.slug, user_id: party.userId, dogs: party.dogs, guesses: [], answers: null, revealed: false, created_at: party.createdAt });
  const parties = readJSON(PARTIES_FILE); const p = { id: party.id, slug: party.slug, user_id: party.userId, dogs: party.dogs, guesses: [], answers: null, revealed: false, created_at: party.createdAt }; parties.push(p); writeJSON(PARTIES_FILE, parties); return p;
}
async function deleteParty(slug) {
  const p = await getPartyBySlug(slug); if (!p) return;
  if (useSupabase) { await supabaseDelete("parties", p.id); return; }
  writeJSON(PARTIES_FILE, readJSON(PARTIES_FILE).filter(x => x.slug !== slug));
}
async function getPartyData(slug) {
  if (useSupabase) { const p = await supabaseSelectOne("parties", { slug: `eq.${slug}`, select: "guesses,answers,revealed,dogs" }); return p ? { guesses: p.guesses||[], answers: p.answers, revealed: p.revealed||false, dogs: p.dogs||[] } : null; }
  const p = readJSON(PARTIES_FILE).find(x => x.slug === slug); return p ? { guesses: p.guesses||[], answers: p.answers, revealed: p.revealed||false, dogs: p.dogs||[] } : null;
}
async function updatePartyGuesses(slug, guesses) {
  if (useSupabase) { const p = await getPartyBySlug(slug); if (p) await supabaseUpdate("parties", p.id, { guesses }); return; }
  const parties = readJSON(PARTIES_FILE); const p = parties.find(x => x.slug === slug); if (p) { p.guesses = guesses; writeJSON(PARTIES_FILE, parties); }
}
async function updatePartyAnswers(slug, answers) {
  if (useSupabase) { const p = await getPartyBySlug(slug); if (p) await supabaseUpdate("parties", p.id, { answers, revealed: false }); return; }
  const parties = readJSON(PARTIES_FILE); const p = parties.find(x => x.slug === slug); if (p) { p.answers = answers; p.revealed = false; writeJSON(PARTIES_FILE, parties); }
}
async function updatePartyReveal(slug, guesses) {
  if (useSupabase) { const p = await getPartyBySlug(slug); if (p) await supabaseUpdate("parties", p.id, { guesses, revealed: true }); return; }
  const parties = readJSON(PARTIES_FILE); const p = parties.find(x => x.slug === slug); if (p) { p.guesses = guesses; p.revealed = true; writeJSON(PARTIES_FILE, parties); }
}

module.exports = { findUserByEmail, findUserByGoogleId, createUser, updateUserGoogleId, getUserById, getPartiesByUser, getPartyBySlug, createParty, deleteParty, getPartyData, updatePartyGuesses, updatePartyAnswers, updatePartyReveal, getConfig, setConfig, rawQuery, rawInsert };

async function rawQuery(table) {
  if (!useSupabase) return { error: "Supabase not configured" };
  try {
    const rows = await supabaseRequest("GET", table, { query: { select: "*" } });
    return { success: true, count: Array.isArray(rows) ? rows.length : 0, sample: Array.isArray(rows) ? rows.slice(0, 2) : rows };
  } catch (e) {
    return { error: e.message };
  }
}

async function getConfig(key) {
  if (useSupabase) {
    const row = await supabaseSelectOne("config", { key: `eq.${key}` });
    return row ? row.value : null;
  }
  const file = path.join(DB_DIR, "config.json");
  try { return JSON.parse(fs.readFileSync(file, "utf-8"))[key] || null; } catch { return null; }
}

async function setConfig(key, value) {
  if (useSupabase) {
    const existing = await supabaseSelectOne("config", { key: `eq.${key}` });
    if (existing) await supabaseUpdate("config", key, { value });
    else await supabaseInsert("config", { key, value });
    return;
  }
  const file = path.join(DB_DIR, "config.json");
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(file, "utf-8")); } catch {}
  cfg[key] = value;
  fs.writeFileSync(file, JSON.stringify(cfg));
}
