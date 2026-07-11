import { getGuesses, addGuess, deleteGuess, getAnswers, setAnswers, getRevealed, reveal } from "../lib/store.js";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "woofletmein";

function checkAuth(headers) {
  return headers["x-admin-password"] === ADMIN_PASSWORD;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Admin-Password");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  // --- Auth ---
  if (req.method === "POST" && url.pathname === "/api/admin/auth") {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) return res.json({ ok: true });
    return res.status(401).json({ error: "Wrong password" });
  }

  // --- Guesses GET ---
  if (req.method === "GET" && url.pathname === "/api/guesses") {
    const guesses = await getGuesses();
    const rev = await getRevealed();
    return res.json({ revealed: rev, guesses });
  }

  // --- Guesses POST ---
  if (req.method === "POST" && url.pathname === "/api/guesses") {
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

    await addGuess(guess);
    return res.status(201).json(guess);
  }

  // --- Guesses DELETE ---
  if (req.method === "DELETE" && url.pathname.startsWith("/api/guesses/")) {
    if (!checkAuth(req.headers)) return res.status(401).json({ error: "Unauthorized" });
    const id = url.pathname.split("/api/guesses/")[1];
    const ok = await deleteGuess(id);
    if (!ok) return res.status(404).json({ error: "Not found" });
    return res.json({ ok: true });
  }

  // --- Answers GET ---
  if (req.method === "GET" && url.pathname === "/api/answers") {
    const answers = await getAnswers();
    const revealed = await getRevealed();
    return res.json({ answers, revealed });
  }

  // --- Answers POST ---
  if (req.method === "POST" && url.pathname === "/api/answers") {
    if (!checkAuth(req.headers)) return res.status(401).json({ error: "Unauthorized" });
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
    const answers = await setAnswers(c1, c2, image1 || null, image2 || null);
    return res.json({ ok: true, answers });
  }

  // --- Reveal ---
  if (req.method === "POST" && url.pathname === "/api/reveal") {
    if (!checkAuth(req.headers)) return res.status(401).json({ error: "Unauthorized" });
    try {
      const guesses = await reveal();
      const answers = await getAnswers();
      return res.json({ ok: true, answers, guesses });
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
  }

  if (req.method === "GET" && url.pathname === "/api/status") {
    const hasUrl = !!process.env.UPSTASH_REDIS_REST_URL;
    const hasToken = !!process.env.UPSTASH_REDIS_REST_TOKEN;
    const guesses = await getGuesses();
    const answers = await getAnswers();
    const revealed = await getRevealed();
    return res.json({
      redis: {
        urlSet: hasUrl,
        tokenSet: hasToken,
        url: hasUrl ? process.env.UPSTASH_REDIS_REST_URL.slice(0, 40) + "..." : "MISSING",
      },
      data: {
        guesses: guesses.length,
        answersSet: !!answers,
        revealed,
        image1: !!(answers && answers.image1),
        image2: !!(answers && answers.image2),
      },
    });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
