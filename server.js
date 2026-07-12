const express = require("express");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const session = require("express-session");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const { v4: uuidv4 } = require("uuid");
const db = require("./lib/db");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString("hex");
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));
app.use(session({ secret: SESSION_SECRET, resave: false, saveUninitialized: false }));
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try { const user = await db.getUserById(id); done(null, user ? { id: user.id, email: user.email, name: user.name } : null); }
  catch { done(null, null); }
});

if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    callbackURL: `${BASE_URL}/api/auth/google/callback`,
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      let user = await db.findUserByGoogleId(profile.id);
      if (!user) {
        user = await db.findUserByEmail(profile.emails[0].value);
        if (user) { await db.updateUserGoogleId(user.id, profile.id); }
        else {
          user = await db.createUser({ email: profile.emails[0].value, name: profile.displayName, password: null, googleId: profile.id });
        }
      }
      done(null, { id: user.id, email: user.email, name: user.name });
    } catch (e) { done(e); }
  }));
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });
  try {
    req.userId = jwt.verify(auth.slice(7), JWT_SECRET).userId;
    next();
  } catch { return res.status(401).json({ error: "Invalid token" }); }
}

async function partyAuth(req, res, next) {
  authMiddleware(req, res, async () => {
    const party = await db.getPartyBySlug(req.params.slug);
    if (!party || party.user_id !== req.userId) return res.status(403).json({ error: "Not your party" });
    req.partySlug = req.params.slug;
    next();
  });
}

// --- Auth Routes ---
app.post("/api/auth/register", async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) return res.status(400).json({ error: "Email, password, and name required" });
  if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });

  try {
    const existing = await db.findUserByEmail(email.toLowerCase());
    if (existing) return res.status(400).json({ error: "Email already registered" });

    const hash = await bcrypt.hash(password, 10);
    const user = await db.createUser({ email: email.toLowerCase(), name: name.trim(), password: hash, googleId: null });
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "30d" });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (e) { res.status(500).json({ error: "Server error" }); }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });

  try {
    const user = await db.findUserByEmail(email.toLowerCase());
    if (!user || !user.password) return res.status(401).json({ error: "Invalid credentials" });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: "Invalid credentials" });
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "30d" });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (e) { res.status(500).json({ error: "Server error" }); }
});

app.get("/api/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));
app.get("/api/auth/google/callback", passport.authenticate("google", { session: false, failureRedirect: "/" }), (req, res) => {
  const token = jwt.sign({ userId: req.user.id }, JWT_SECRET, { expiresIn: "30d" });
  res.redirect(`/dashboard?token=${token}`);
});

app.get("/api/auth/me", authMiddleware, async (req, res) => {
  try {
    const user = await db.getUserById(req.userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ id: user.id, email: user.email, name: user.name });
  } catch { res.status(500).json({ error: "Server error" }); }
});

// --- Party Routes ---
app.get("/api/parties", authMiddleware, async (req, res) => {
  try {
    const parties = await db.getPartiesByUser(req.userId);
    res.json(parties.map(p => ({
      id: p.id, slug: p.slug, userId: p.user_id,
      dog1Name: p.dog1_name, dog2Name: p.dog2_name,
      guessCount: (p.guesses || []).length,
      revealed: p.revealed || false,
      createdAt: p.created_at,
    })));
  } catch { res.json([]); }
});

app.post("/api/parties", authMiddleware, async (req, res) => {
  const { dog1Name, dog2Name, slug } = req.body;
  if (!dog1Name || !dog2Name) return res.status(400).json({ error: "Both dog names required" });

  try {
    const partySlug = (slug || dog1Name.toLowerCase().replace(/[^a-z0-9]/g, "-") + "-" + uuidv4().slice(0, 6)).toLowerCase().replace(/[^a-z0-9-]/g, "");
    const existing = await db.getPartyBySlug(partySlug);
    if (existing) return res.status(400).json({ error: "Slug taken, try another" });

    const party = await db.createParty({
      id: uuidv4(), slug: partySlug, userId: req.userId,
      dog1Name: dog1Name.trim(), dog2Name: dog2Name.trim(),
      createdAt: new Date().toISOString(),
    });
    res.status(201).json({ id: party.id, slug: party.slug, dog1Name: party.dog1_name, dog2Name: party.dog2_name });
  } catch (e) { res.status(500).json({ error: "Server error" }); }
});

app.delete("/api/parties/:slug", partyAuth, async (req, res) => {
  await db.deleteParty(req.params.slug);
  res.json({ ok: true });
});

// --- Party-specific: guest guessing ---
app.get("/api/parties/:slug/guesses", async (req, res) => {
  const data = await db.getPartyData(req.params.slug);
  if (!data) return res.status(404).json({ error: "Party not found" });
  res.json(data);
});

app.post("/api/parties/:slug/guesses", async (req, res) => {
  const data = await db.getPartyData(req.params.slug);
  if (!data) return res.status(404).json({ error: "Party not found" });

  const { name, dog1, dog2 } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "Name is required" });
  if (!dog1 || !Array.isArray(dog1) || dog1.length === 0) return res.status(400).json({ error: "At least one breed required" });
  if (!dog2 || !Array.isArray(dog2) || dog2.length === 0) return res.status(400).json({ error: "At least one breed required" });

  const guess = {
    id: uuidv4().slice(0, 8),
    name: name.trim(),
    dog1: dog1.filter(b => b && b.trim()).map(b => b.trim()),
    dog2: dog2.filter(b => b && b.trim()).map(b => b.trim()),
    timestamp: new Date().toISOString(),
  };

  data.guesses.push(guess);
  await db.updatePartyGuesses(req.params.slug, data.guesses);
  res.status(201).json(guess);
});

// --- Party-specific: admin ---
app.get("/api/parties/:slug/answers", partyAuth, async (req, res) => {
  const data = await db.getPartyData(req.params.slug);
  res.json({ answers: data.answers, revealed: data.revealed });
});

app.post("/api/parties/:slug/answers", partyAuth, async (req, res) => {
  const { dog1, dog2, image1, image2 } = req.body;
  if (!dog1 || !Array.isArray(dog1) || dog1.length === 0) return res.status(400).json({ error: "At least one breed" });
  if (!dog2 || !Array.isArray(dog2) || dog2.length === 0) return res.status(400).json({ error: "At least one breed" });

  const c1 = dog1.filter(b => b && b.breed && b.breed.trim()).map(b => ({ breed: b.breed.trim(), percentage: Number(b.percentage) || 0 }));
  const c2 = dog2.filter(b => b && b.breed && b.breed.trim()).map(b => ({ breed: b.breed.trim(), percentage: Number(b.percentage) || 0 }));

  const t1 = c1.reduce((s, b) => s + b.percentage, 0), t2 = c2.reduce((s, b) => s + b.percentage, 0);
  if (Math.abs(t1 - 100) > 0.5 || Math.abs(t2 - 100) > 0.5) return res.status(400).json({ error: "Percentages must add up to 100%" });

  const answers = { dog1: c1, dog2: c2, image1: image1 || null, image2: image2 || null };
  await db.updatePartyAnswers(req.params.slug, answers);
  res.json({ ok: true, answers });
});

app.delete("/api/parties/:slug/guesses/:id", partyAuth, async (req, res) => {
  const data = await db.getPartyData(req.params.slug);
  const idx = (data.guesses || []).findIndex(g => g.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  data.guesses.splice(idx, 1);
  await db.updatePartyGuesses(req.params.slug, data.guesses);
  res.json({ ok: true });
});

app.post("/api/parties/:slug/reveal", partyAuth, async (req, res) => {
  const data = await db.getPartyData(req.params.slug);
  if (!data.answers) return res.status(400).json({ error: "Set answers first" });

  const names1 = data.answers.dog1.map(e => e.breed.toLowerCase());
  const names2 = data.answers.dog2.map(e => e.breed.toLowerCase());

  function scoreDog(guess, answerNames) {
    const set = new Set(answerNames);
    const matches = guess.filter(b => set.has(b.toLowerCase())).length;
    if (matches === answerNames.length && guess.length === answerNames.length) return "correct";
    if (matches > 0) return "close";
    return "wrong";
  }

  data.guesses.forEach(g => {
    g.score1 = scoreDog(g.dog1, names1);
    g.score2 = scoreDog(g.dog2, names2);
    if (g.score1 === "correct" && g.score2 === "correct") g.score = "correct";
    else if (g.score1 !== "wrong" || g.score2 !== "wrong") g.score = "close";
    else g.score = "wrong";
  });

  await db.updatePartyReveal(req.params.slug, data.guesses);
  res.json({ ok: true, answers: data.answers, guesses: data.guesses });
});

// --- Serve pages ---
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "login.html")));
app.get("/dashboard", (req, res) => res.sendFile(path.join(__dirname, "public", "dashboard.html")));
app.get("/p/:slug", (req, res) => res.sendFile(path.join(__dirname, "public", "party.html")));
app.get("/p/:slug/admin", (req, res) => res.sendFile(path.join(__dirname, "public", "party-admin.html")));
app.get("/p/:slug/slideshow", (req, res) => res.sendFile(path.join(__dirname, "public", "party-slideshow.html")));
app.get("/p/:slug/qr", (req, res) => res.sendFile(path.join(__dirname, "public", "party-qr.html")));

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
