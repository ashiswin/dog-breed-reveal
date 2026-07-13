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
    let url = `${supabaseUrl}/rest/v1/${table}`;
    if (options.query) url += "?" + new URLSearchParams(options.query).toString();
    if (options.id) url += `?id=eq.${encodeURIComponent(options.id)}`;
    const headers = { "apikey": supabaseKey, "Authorization": `Bearer ${supabaseKey}`, "Content-Type": "application/json", "Prefer": options.returnMinimal ? "return=minimal" : "return=representation" };
    const parsed = new URL(url);
    const opts = { method, headers, hostname: parsed.hostname, path: parsed.pathname + parsed.search };
    if (options.body) { const bs = JSON.stringify(options.body); headers["Content-Length"] = Buffer.byteLength(bs); }
    const req = https.request(opts, res => { let d=""; res.on("data",c=>d+=c); res.on("end",()=>{ try { resolve(d?JSON.parse(d):null); } catch { resolve(null); } }); });
    req.on("error", reject);
    if (options.body) req.write(JSON.stringify(options.body));
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

async function getPartiesByUser(userId) { return useSupabase ? supabaseSelect("parties", { user_id: `eq.${userId}`, order: "created_at.desc" }) : readJSON(PARTIES_FILE).filter(p => p.user_id === userId).sort((a,b) => new Date(b.created_at)-new Date(a.created_at)); }
async function getPartyBySlug(slug) { return useSupabase ? supabaseSelectOne("parties", { slug: `eq.${slug}` }) : (readJSON(PARTIES_FILE).find(p => p.slug === slug) || null); }

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

module.exports = { findUserByEmail, findUserByGoogleId, createUser, updateUserGoogleId, getUserById, getPartiesByUser, getPartyBySlug, createParty, deleteParty, getPartyData, updatePartyGuesses, updatePartyAnswers, updatePartyReveal };
