const express = require("express");
const path = require("path");
const fs = require("fs");
const https = require("https");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("./lib/db");

const app = express();
const PORT = process.env.PORT || 3000;
let JWT_SECRET = process.env.JWT_SECRET || crypto.createHash("sha256").update(process.env.SUPABASE_URL || crypto.randomBytes(32).toString("hex")).digest("hex");

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });
  try { req.userId = jwt.verify(auth.slice(7), JWT_SECRET).userId; next(); }
  catch { return res.status(401).json({ error: "Invalid token" }); }
}

async function partyAuth(req, res, next) {
  authMiddleware(req, res, async () => {
    const p = await db.getPartyBySlug(req.params.slug);
    if (!p || p.user_id !== req.userId) return res.status(403).json({ error: "Not your party" });
    next();
  });
}

app.post("/api/auth/register", async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) return res.status(400).json({ error: "All fields required" });
  if (password.length < 6) return res.status(400).json({ error: "Password too short" });
  try {
    if (await db.findUserByEmail(email.toLowerCase())) return res.status(400).json({ error: "Email taken" });
    const user = await db.createUser({ email: email.toLowerCase(), name: name.trim(), password: await bcrypt.hash(password, 10) });
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "30d" });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch { res.status(500).json({ error: "Server error" }); }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });
  try {
    const user = await db.findUserByEmail(email.toLowerCase());
    if (!user || !user.password || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ error: "Invalid credentials" });
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "30d" });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch { res.status(500).json({ error: "Server error" }); }
});

app.get("/api/auth/google", (req, res) => {
  if (!GOOGLE_CLIENT_ID) return res.redirect("/");
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(BASE_URL+"/api/auth/google/callback")}&response_type=code&scope=${encodeURIComponent("profile email")}&access_type=offline&prompt=consent`);
});

app.get("/api/auth/google/callback", async (req, res) => {
  const { code } = req.query; if (!code) return res.redirect("/");
  try {
    const td = await postForm("https://oauth2.googleapis.com/token", { code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, redirect_uri: BASE_URL+"/api/auth/google/callback", grant_type: "authorization_code" });
    const at = JSON.parse(td).access_token;
    const profile = JSON.parse(await httpGet("https://www.googleapis.com/oauth2/v2/userinfo", { Authorization: "Bearer "+at }));
    let user = await db.findUserByGoogleId(profile.id) || await db.findUserByEmail(profile.email);
    if (user && !user.google_id) await db.updateUserGoogleId(user.id, profile.id);
    else if (!user) user = await db.createUser({ email: profile.email, name: profile.name || profile.email, password: null, googleId: profile.id });
    res.redirect(`/dashboard?token=${jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "30d" })}`);
  } catch { res.redirect("/"); }
});

app.get("/api/auth/me", authMiddleware, async (req, res) => {
  const u = await db.getUserById(req.userId);
  u ? res.json({ id: u.id, email: u.email, name: u.name }) : res.status(404).json({ error: "Not found" });
});

app.get("/api/debug", async (req, res) => {
  const raw = await db.rawQuery("parties");
  const ins = await db.rawInsert("parties", {
    id: "debug-" + Date.now(),
    slug: "debug-test",
    user_id: "00000000-0000-0000-0000-000000000000",
    dogs: [{ name: "DebugTest" }],
    guesses: [],
    answers: null,
    revealed: false,
    created_at: new Date().toISOString(),
  });
  res.json({ supabase: !!process.env.SUPABASE_URL, parties: raw, insertTest: ins, jwt: JWT_SECRET.slice(0, 8) + "..." });
});

app.get("/api/parties", authMiddleware, async (req, res) => {
  try {
    const parties = await db.getPartiesByUser(req.userId);
    res.json(parties.map(p => ({ id: p.id, slug: p.slug, dogs: p.dogs || [], guessCount: (p.guesses||[]).length, revealed: p.revealed||false, createdAt: p.created_at })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/parties", authMiddleware, async (req, res) => {
  const { dogs, slug } = req.body;
  if (!dogs || !Array.isArray(dogs) || dogs.length === 0 || !dogs.every(d => d.name && d.name.trim())) return res.status(400).json({ error: "At least one dog name required" });
  const cleanDogs = dogs.map(d => ({ name: d.name.trim() }));
  const s = (slug || cleanDogs[0].name.toLowerCase().replace(/[^a-z0-9]/g,"-")+"-"+crypto.randomUUID().slice(0,6)).toLowerCase().replace(/[^a-z0-9-]/g,"");
  if (await db.getPartyBySlug(s)) return res.status(400).json({ error: "Slug taken" });
  const party = await db.createParty({ id: crypto.randomUUID(), slug: s, userId: req.userId, dogs: cleanDogs, createdAt: new Date().toISOString() });
  res.status(201).json({ id: party.id, slug: party.slug, dogs: party.dogs || cleanDogs });
});

app.delete("/api/parties/:slug", partyAuth, async (req, res) => { await db.deleteParty(req.params.slug); res.json({ ok:true }); });

// --- Guesses ---
app.get("/api/parties/:slug/guesses", async (req, res) => {
  const d = await db.getPartyData(req.params.slug);
  if (!d) return res.status(404).json({ error: "Not found" });
  res.json({ revealed: d.revealed||false, answers: d.answers, guesses: d.guesses||[] });
});

app.post("/api/parties/:slug/guesses", async (req, res) => {
  const data = await db.getPartyData(req.params.slug);
  if (!data) return res.status(404).json({ error: "Not found" });
  const { name, guesses } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "Name required" });
  if (!guesses || !Array.isArray(guesses) || guesses.length === 0) return res.status(400).json({ error: "At least one breed guess required" });
  const clean = guesses.map(g => (Array.isArray(g) ? g : [g]).filter(b => b && b.trim()).map(b => b.trim())).filter(g => g.length > 0);
  if (clean.length === 0) return res.status(400).json({ error: "At least one breed per dog" });
  const guess = { id: crypto.randomUUID().slice(0,8), name: name.trim(), guesses: clean, timestamp: new Date().toISOString() };
  data.guesses.push(guess);
  await db.updatePartyGuesses(req.params.slug, data.guesses);
  res.status(201).json(guess);
});

// --- Admin ---
app.get("/api/parties/:slug/answers", partyAuth, async (req, res) => {
  const d = await db.getPartyData(req.params.slug);
  res.json({ answers: d.answers, revealed: d.revealed });
});

app.post("/api/parties/:slug/answers", partyAuth, async (req, res) => {
  const { dogs } = req.body;
  if (!dogs || !Array.isArray(dogs) || dogs.length === 0) return res.status(400).json({ error: "At least one dog" });
  const clean = dogs.map(d => {
    const breeds = (d.breeds||[]).filter(b => b && b.breed && b.breed.trim()).map(b => ({ breed: b.breed.trim(), percentage: Number(b.percentage)||0 }));
    const total = breeds.reduce((s,b) => s + b.percentage, 0);
    if (Math.abs(total - 100) > 0.5) return null;
    return { breeds, image: d.image || null };
  });
  if (clean.includes(null)) return res.status(400).json({ error: "Each dog's percentages must sum to 100%" });
  await db.updatePartyAnswers(req.params.slug, { dogs: clean });
  res.json({ ok: true, dogs: clean });
});

app.delete("/api/parties/:slug/guesses/:id", partyAuth, async (req, res) => {
  const data = await db.getPartyData(req.params.slug);
  const idx = (data.guesses||[]).findIndex(g => g.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  data.guesses.splice(idx, 1);
  await db.updatePartyGuesses(req.params.slug, data.guesses);
  res.json({ ok: true });
});

app.post("/api/parties/:slug/reveal", partyAuth, async (req, res) => {
  const data = await db.getPartyData(req.params.slug);
  if (!data.answers || !data.answers.dogs) return res.status(400).json({ error: "Set answers first" });

  function scoreDog(guessBreeds, answerBreeds) {
    const set = new Set(answerBreeds.map(b => b.breed.toLowerCase()));
    const matches = guessBreeds.filter(b => set.has(b.toLowerCase())).length;
    if (matches === answerBreeds.length && guessBreeds.length === answerBreeds.length) return "correct";
    if (matches > 0) return "close";
    return "wrong";
  }

  data.guesses.forEach(g => {
    g.scores = (g.guesses || []).map((gg, i) => {
      const ans = data.answers.dogs[i];
      return ans ? scoreDog(gg, ans.breeds) : "wrong";
    });
    g.score = g.scores.every(s => s === "correct") ? "correct" : g.scores.some(s => s !== "wrong") ? "close" : "wrong";
  });

  await db.updatePartyReveal(req.params.slug, data.guesses);
  res.json({ ok: true, answers: data.answers, guesses: data.guesses });
});

// --- Pages ---
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "login.html")));
app.get("/dashboard", (req, res) => res.sendFile(path.join(__dirname, "public", "dashboard.html")));
app.get("/p/:slug", (req, res) => res.sendFile(path.join(__dirname, "public", "party.html")));
app.get("/p/:slug/admin", (req, res) => res.sendFile(path.join(__dirname, "public", "party-admin.html")));
app.get("/p/:slug/slideshow", (req, res) => res.sendFile(path.join(__dirname, "public", "party-slideshow.html")));
app.get("/p/:slug/qr", (req, res) => res.sendFile(path.join(__dirname, "public", "party-qr.html")));

function postForm(url, params) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(params).toString();
    const req = https.request(url, { method:"POST", headers:{"Content-Type":"application/x-www-form-urlencoded","Content-Length":body.length} }, res => {
      let d=""; res.on("data",c=>d+=c); res.on("end",()=>resolve(d));
    }); req.on("error",reject); req.write(body); req.end();
  });
}
function httpGet(url, headers) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, res => { let d=""; res.on("data",c=>d+=c); res.on("end",()=>resolve(d)); }).on("error",reject);
  });
}
if (process.env.NODE_ENV !== "production" || !process.env.VERCEL) {
  app.listen(PORT, () => console.log(`http://localhost:${PORT}`));
}
module.exports = app;
