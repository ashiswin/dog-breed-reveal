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

function readJSON(f) { try { return JSON.parse(fs.readFileSync(f, "utf-8")); } catch { return []; } }
function writeJSON(f, d) { fs.writeFileSync(f, JSON.stringify(d, null, 2)); }

function supabaseRequest(method, table, options) {
  options = options || {};
  return new Promise(function (resolve, reject) {
    var p = table;
    if (options.id) p += "?id=eq." + encodeURIComponent(options.id);
    else if (options.query) p += "?" + new URLSearchParams(options.query).toString();

    var body = options.body ? JSON.stringify(options.body) : null;
    var headers = {
      "apikey": supabaseKey,
      "Authorization": "Bearer " + supabaseKey,
      "Content-Type": "application/json",
      "Prefer": options.returnMinimal ? "return=minimal" : "return=representation",
    };
    if (body) headers["Content-Length"] = Buffer.byteLength(body);

    var u = new URL(supabaseUrl);
    var req = https.request({ method: method, hostname: u.hostname, path: "/rest/v1/" + p, headers: headers }, function (res) {
      var d = "";
      res.on("data", function (c) { d += c; });
      res.on("end", function () {
        if (res.statusCode >= 400) return reject(new Error("Supabase " + res.statusCode + ": " + d));
        try { resolve(d ? JSON.parse(d) : null); } catch (e) { resolve(null); }
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function supabaseSelect(table, query) { return supabaseRequest("GET", table, { query: query }).then(function (r) { return Array.isArray(r) ? r : (r ? [r] : []); }); }
function supabaseSelectOne(table, query) { return supabaseSelect(table, query).then(function (r) { return r[0] || null; }); }
function supabaseInsert(table, row) { return supabaseRequest("POST", table, { body: row }).then(function (r) { return Array.isArray(r) ? r[0] : r; }); }
function supabaseUpdate(table, id, updates) { return supabaseRequest("PATCH", table, { id: id, body: updates, returnMinimal: true }); }
function supabaseDelete(table, id) { return supabaseRequest("DELETE", table, { id: id, returnMinimal: true }); }

// Users
function findUserByEmail(email) {
  if (useSupabase) return supabaseSelectOne("users", { email: "eq." + email.toLowerCase() });
  return Promise.resolve(readJSON(USERS_FILE).find(function (u) { return u.email === email.toLowerCase(); }) || null);
}
function findUserByGoogleId(googleId) {
  if (useSupabase) return supabaseSelectOne("users", { google_id: "eq." + googleId });
  return Promise.resolve(readJSON(USERS_FILE).find(function (u) { return u.google_id === googleId; }) || null);
}
function createUser(user) {
  if (useSupabase) return supabaseInsert("users", { email: user.email, password: user.password, name: user.name, google_id: user.googleId || null });
  var users = readJSON(USERS_FILE);
  var u = { id: crypto.randomUUID(), email: user.email, password: user.password, name: user.name, google_id: user.googleId || null, created_at: new Date().toISOString() };
  users.push(u); writeJSON(USERS_FILE, users);
  return Promise.resolve(u);
}
function updateUserGoogleId(id, googleId) {
  if (useSupabase) return supabaseUpdate("users", id, { google_id: googleId });
  var users = readJSON(USERS_FILE); var u = users.find(function (x) { return x.id === id; });
  if (u) { u.google_id = googleId; writeJSON(USERS_FILE, users); }
  return Promise.resolve();
}
function getUserById(id) {
  if (useSupabase) return supabaseSelectOne("users", { id: "eq." + id });
  return Promise.resolve(readJSON(USERS_FILE).find(function (u) { return u.id === id; }) || null);
}

// Parties
function getPartiesByUser(userId) {
  if (useSupabase) return supabaseSelect("parties", { select: "id,slug,user_id,dogs,guesses,answers,revealed,created_at", user_id: "eq." + userId, order: "created_at.desc" });
  return Promise.resolve(readJSON(PARTIES_FILE).filter(function (p) { return p.user_id === userId; }).sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); }));
}
function getPartyBySlug(slug) {
  if (useSupabase) return supabaseSelectOne("parties", { select: "id,slug,user_id,dogs,guesses,answers,revealed,created_at", slug: "eq." + slug });
  return Promise.resolve(readJSON(PARTIES_FILE).find(function (p) { return p.slug === slug; }) || null);
}
function createParty(party) {
  if (useSupabase) return supabaseInsert("parties", { id: party.id, slug: party.slug, user_id: party.userId, dogs: party.dogs, guesses: [], answers: null, revealed: false, created_at: party.createdAt });
  var parties = readJSON(PARTIES_FILE);
  var p = { id: party.id, slug: party.slug, user_id: party.userId, dogs: party.dogs, guesses: [], answers: null, revealed: false, created_at: party.createdAt };
  parties.push(p); writeJSON(PARTIES_FILE, parties);
  return Promise.resolve(p);
}
function deleteParty(slug) {
  return getPartyBySlug(slug).then(function (p) {
    if (!p) return;
    if (useSupabase) return supabaseDelete("parties", p.id);
    writeJSON(PARTIES_FILE, readJSON(PARTIES_FILE).filter(function (x) { return x.slug !== slug; }));
  });
}
function getPartyData(slug) {
  if (useSupabase) {
    return supabaseSelectOne("parties", { select: "guesses,answers,revealed,dogs", slug: "eq." + slug }).then(function (p) {
      return p ? { guesses: p.guesses || [], answers: p.answers, revealed: p.revealed || false, dogs: p.dogs || [] } : null;
    });
  }
  var p = readJSON(PARTIES_FILE).find(function (x) { return x.slug === slug; });
  return Promise.resolve(p ? { guesses: p.guesses || [], answers: p.answers, revealed: p.revealed || false, dogs: p.dogs || [] } : null);
}
function updatePartyGuesses(slug, guesses) {
  return getPartyBySlug(slug).then(function (p) {
    if (!p) return;
    if (useSupabase) return supabaseUpdate("parties", p.id, { guesses: guesses });
    var parties = readJSON(PARTIES_FILE); var pp = parties.find(function (x) { return x.slug === slug; });
    if (pp) { pp.guesses = guesses; writeJSON(PARTIES_FILE, parties); }
  });
}
function updatePartyAnswers(slug, answers) {
  return getPartyBySlug(slug).then(function (p) {
    if (!p) return;
    if (useSupabase) return supabaseUpdate("parties", p.id, { answers: answers, revealed: false });
    var parties = readJSON(PARTIES_FILE); var pp = parties.find(function (x) { return x.slug === slug; });
    if (pp) { pp.answers = answers; pp.revealed = false; writeJSON(PARTIES_FILE, parties); }
  });
}
function updatePartyReveal(slug, guesses) {
  return getPartyBySlug(slug).then(function (p) {
    if (!p) return;
    if (useSupabase) return supabaseUpdate("parties", p.id, { guesses: guesses, revealed: true });
    var parties = readJSON(PARTIES_FILE); var pp = parties.find(function (x) { return x.slug === slug; });
    if (pp) { pp.guesses = guesses; pp.revealed = true; writeJSON(PARTIES_FILE, parties); }
  });
}

function rawQuery(table) {
  if (!useSupabase) return Promise.resolve({ error: "Supabase not configured" });
  return supabaseRequest("GET", table, { query: { select: "*" } }).then(function (r) { return { rows: r }; }).catch(function (e) { return { error: e.message }; });
}
function rawInsert(table, row) {
  if (!useSupabase) return Promise.resolve({ error: "Supabase not configured" });
  return supabaseRequest("POST", table, { body: row }).then(function (r) { return { result: r }; }).catch(function (e) { return { error: e.message }; });
}

module.exports = { findUserByEmail: findUserByEmail, findUserByGoogleId: findUserByGoogleId, createUser: createUser, updateUserGoogleId: updateUserGoogleId, getUserById: getUserById, getPartiesByUser: getPartiesByUser, getPartyBySlug: getPartyBySlug, createParty: createParty, deleteParty: deleteParty, getPartyData: getPartyData, updatePartyGuesses: updatePartyGuesses, updatePartyAnswers: updatePartyAnswers, updatePartyReveal: updatePartyReveal, rawQuery: rawQuery, rawInsert: rawInsert };
