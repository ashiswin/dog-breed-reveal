const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
let { createClient } = require("@supabase/supabase-js");
if (!createClient) createClient = require("@supabase/supabase-js").createClient;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const useSupabase = !!(supabaseUrl && supabaseKey);

let supabase = null;
if (useSupabase) {
  supabase = createClient(supabaseUrl, supabaseKey);
}

// File-based fallback
const DB_DIR = path.join(__dirname, "..", "data");
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
const USERS_FILE = path.join(DB_DIR, "users.json");
const PARTIES_FILE = path.join(DB_DIR, "parties.json");

function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf-8")); }
  catch { return []; }
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// --- Users ---
async function findUserByEmail(email) {
  if (useSupabase) {
    const { data } = await supabase.from("users").select("*").eq("email", email.toLowerCase()).single();
    return data;
  }
  return readJSON(USERS_FILE).find(u => u.email === email.toLowerCase()) || null;
}

async function findUserByGoogleId(googleId) {
  if (useSupabase) {
    const { data } = await supabase.from("users").select("*").eq("google_id", googleId).single();
    return data;
  }
  return readJSON(USERS_FILE).find(u => u.google_id === googleId) || null;
}

async function createUser(user) {
  if (useSupabase) {
    const { data, error } = await supabase.from("users").insert({
      email: user.email, password: user.password, name: user.name, google_id: user.googleId || null,
    }).select().single();
    if (error) throw error;
    return data;
  }
  const users = readJSON(USERS_FILE);
  const u = { id: uuidv4(), email: user.email, password: user.password, name: user.name, google_id: user.googleId || null, created_at: new Date().toISOString() };
  users.push(u);
  writeJSON(USERS_FILE, users);
  return u;
}

async function updateUserGoogleId(id, googleId) {
  if (useSupabase) {
    await supabase.from("users").update({ google_id: googleId }).eq("id", id);
    return;
  }
  const users = readJSON(USERS_FILE);
  const u = users.find(u => u.id === id);
  if (u) { u.google_id = googleId; writeJSON(USERS_FILE, users); }
}

async function getUserById(id) {
  if (useSupabase) {
    const { data } = await supabase.from("users").select("*").eq("id", id).single();
    return data;
  }
  return readJSON(USERS_FILE).find(u => u.id === id) || null;
}

// --- Parties ---
async function getPartiesByUser(userId) {
  if (useSupabase) {
    const { data } = await supabase.from("parties").select("*").eq("user_id", userId).order("created_at", { ascending: false });
    return (data || []).map(p => ({ id: p.id, slug: p.slug, user_id: p.user_id, dog1_name: p.dog1_name, dog2_name: p.dog2_name, guesses: p.guesses || [], answers: p.answers, revealed: p.revealed || false, created_at: p.created_at }));
  }
  return readJSON(PARTIES_FILE).filter(p => p.user_id === userId).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

async function getPartyBySlug(slug) {
  if (useSupabase) {
    const { data } = await supabase.from("parties").select("*").eq("slug", slug).single();
    return data;
  }
  return readJSON(PARTIES_FILE).find(p => p.slug === slug) || null;
}

async function createParty(party) {
  if (useSupabase) {
    const { data, error } = await supabase.from("parties").insert({
      id: party.id, slug: party.slug, user_id: party.userId,
      dog1_name: party.dog1Name, dog2_name: party.dog2Name,
      guesses: [], answers: null, revealed: false, created_at: party.createdAt,
    }).select().single();
    if (error) throw error;
    return data;
  }
  const parties = readJSON(PARTIES_FILE);
  const p = { id: party.id, slug: party.slug, user_id: party.userId, dog1_name: party.dog1Name, dog2_name: party.dog2Name, guesses: [], answers: null, revealed: false, created_at: party.createdAt };
  parties.push(p);
  writeJSON(PARTIES_FILE, parties);
  return p;
}

async function deleteParty(slug) {
  if (useSupabase) {
    await supabase.from("parties").delete().eq("slug", slug);
    return;
  }
  let parties = readJSON(PARTIES_FILE);
  parties = parties.filter(p => p.slug !== slug);
  writeJSON(PARTIES_FILE, parties);
}

async function getPartyData(slug) {
  if (useSupabase) {
    const { data } = await supabase.from("parties").select("guesses,answers,revealed").eq("slug", slug).single();
    if (!data) return null;
    return { guesses: data.guesses || [], answers: data.answers, revealed: data.revealed || false };
  }
  const p = readJSON(PARTIES_FILE).find(p => p.slug === slug);
  if (!p) return null;
  return { guesses: p.guesses || [], answers: p.answers, revealed: p.revealed || false };
}

async function updatePartyGuesses(slug, guesses) {
  if (useSupabase) {
    await supabase.from("parties").update({ guesses }).eq("slug", slug);
    return;
  }
  const parties = readJSON(PARTIES_FILE);
  const p = parties.find(p => p.slug === slug);
  if (p) { p.guesses = guesses; writeJSON(PARTIES_FILE, parties); }
}

async function updatePartyAnswers(slug, answers) {
  if (useSupabase) {
    await supabase.from("parties").update({ answers, revealed: false }).eq("slug", slug);
    return;
  }
  const parties = readJSON(PARTIES_FILE);
  const p = parties.find(p => p.slug === slug);
  if (p) { p.answers = answers; p.revealed = false; writeJSON(PARTIES_FILE, parties); }
}

async function updatePartyReveal(slug, guesses) {
  if (useSupabase) {
    await supabase.from("parties").update({ guesses, revealed: true }).eq("slug", slug);
    return;
  }
  const parties = readJSON(PARTIES_FILE);
  const p = parties.find(p => p.slug === slug);
  if (p) { p.guesses = guesses; p.revealed = true; writeJSON(PARTIES_FILE, parties); }
}

module.exports = {
  findUserByEmail, findUserByGoogleId, createUser, updateUserGoogleId, getUserById,
  getPartiesByUser, getPartyBySlug, createParty, deleteParty,
  getPartyData, updatePartyGuesses, updatePartyAnswers, updatePartyReveal,
};
