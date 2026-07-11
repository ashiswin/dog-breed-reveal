const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "woofletmein";
const DATA_FILE = path.join(__dirname, "data.json");

app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/admin", (req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));
app.get("/slideshow", (req, res) => res.sendFile(path.join(__dirname, "public", "slideshow.html")));
app.get("/qr", (req, res) => res.sendFile(path.join(__dirname, "public", "qr.html")));
app.get("/splash", (req, res) => res.sendFile(path.join(__dirname, "public", "qr.html")));

let guesses = [];
let answers = null;
let revealed = false;

function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ guesses, answers, revealed }, null, 2));
  } catch (e) {
    console.error("Failed to save data:", e.message);
  }
}

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, "utf-8");
      const data = JSON.parse(raw);
      guesses = data.guesses || [];
      answers = data.answers || null;
      revealed = data.revealed || false;
      console.log(`Loaded data: ${guesses.length} guesses, answers=${!!answers}, revealed=${revealed}`);
    }
  } catch (e) {
    console.error("Failed to load data:", e.message);
  }
}

function checkAuth(req, res, next) {
  const pw = req.headers["x-admin-password"];
  if (pw !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// --- Auth ---
app.post("/api/admin/auth", (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    return res.json({ ok: true });
  }
  res.status(401).json({ error: "Wrong password" });
});

// --- Guesses ---
app.get("/api/guesses", (req, res) => {
  res.json({ revealed, answers, guesses });
});

app.post("/api/guesses", (req, res) => {
  const { name, dog1, dog2 } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Name is required" });
  }
  if (!dog1 || !Array.isArray(dog1) || dog1.length === 0) {
    return res.status(400).json({ error: "At least one breed required for Fifi" });
  }
  if (!dog2 || !Array.isArray(dog2) || dog2.length === 0) {
    return res.status(400).json({ error: "At least one breed required for Snowy" });
  }

  const cleaned1 = dog1.filter(b => b && b.trim()).map(b => b.trim());
  const cleaned2 = dog2.filter(b => b && b.trim()).map(b => b.trim());

  if (cleaned1.length === 0 || cleaned2.length === 0) {
    return res.status(400).json({ error: "Both dogs need at least one breed" });
  }
  if (cleaned1.length > 4 || cleaned2.length > 4) {
    return res.status(400).json({ error: "Maximum 4 breeds per dog" });
  }

  const guess = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    name: name.trim(),
    dog1: cleaned1,
    dog2: cleaned2,
    timestamp: new Date().toISOString(),
  };

  guesses.push(guess);
  saveData();
  res.status(201).json(guess);
});

app.delete("/api/guesses/:id", checkAuth, (req, res) => {
  const { id } = req.params;
  const idx = guesses.findIndex(g => g.id === id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  guesses.splice(idx, 1);
  saveData();
  res.json({ ok: true });
});

// --- Answers ---
app.get("/api/answers", (req, res) => {
  res.json({ answers, revealed });
});

app.post("/api/answers", checkAuth, (req, res) => {
  const { dog1, dog2, image1, image2 } = req.body;
  if (!dog1 || !Array.isArray(dog1) || dog1.length === 0) {
    return res.status(400).json({ error: "At least one breed for Fifi" });
  }
  if (!dog2 || !Array.isArray(dog2) || dog2.length === 0) {
    return res.status(400).json({ error: "At least one breed for Snowy" });
  }
  const c1 = dog1.filter(b => b && b.breed && b.breed.trim()).map(b => ({ breed: b.breed.trim(), percentage: Number(b.percentage) || 0 }));
  const c2 = dog2.filter(b => b && b.breed && b.breed.trim()).map(b => ({ breed: b.breed.trim(), percentage: Number(b.percentage) || 0 }));
  if (c1.length === 0 || c2.length === 0) {
    return res.status(400).json({ error: "Each dog needs at least one breed" });
  }
  const total1 = c1.reduce((s, b) => s + b.percentage, 0);
  const total2 = c2.reduce((s, b) => s + b.percentage, 0);
  if (Math.abs(total1 - 100) > 0.5 || Math.abs(total2 - 100) > 0.5) {
    return res.status(400).json({ error: `Percentages must add up to 100%. Fifi: ${total1}%, Snowy: ${total2}%` });
  }
  answers = { dog1: c1, dog2: c2, image1: image1 || null, image2: image2 || null };
  revealed = false;
  saveData();
  res.json({ ok: true, answers });
});

// --- Reveal ---
app.post("/api/reveal", checkAuth, (req, res) => {
  if (!answers) return res.status(400).json({ error: "Set answers first" });

  function breedNames(entry) {
    if (Array.isArray(entry)) {
      return entry.map(e => typeof e === "string" ? e : e.breed || "");
    }
    return [];
  }

  const ans1 = breedNames(answers.dog1);
  const ans2 = breedNames(answers.dog2);

  function scoreDog(guessBreeds, answerBreeds) {
    const set = new Set(answerBreeds.map(b => b.toLowerCase()));
    const matches = guessBreeds.filter(b => set.has(b.toLowerCase())).length;
    if (matches === answerBreeds.length && guessBreeds.length === answerBreeds.length) return "correct";
    if (matches > 0) return "close";
    return "wrong";
  }

  guesses.forEach(g => {
    const s1 = scoreDog(g.dog1, ans1);
    const s2 = scoreDog(g.dog2, ans2);
    g.score1 = s1;
    g.score2 = s2;
    if (s1 === "correct" && s2 === "correct") g.score = "correct";
    else if (s1 !== "wrong" || s2 !== "wrong") g.score = "close";
    else g.score = "wrong";
  });

  revealed = true;
  saveData();
  res.json({ ok: true, answers, guesses });
});

loadData();

app.listen(PORT, () => {
  console.log(`Dog Breed Reveal server running at http://localhost:${PORT}`);
});
