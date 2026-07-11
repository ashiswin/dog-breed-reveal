let redis;
let memStore = { guesses: [], answers: null, revealed: false };

async function getRedis() {
  if (!redis) {
    try {
      const { Redis } = await import("@upstash/redis");
      redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      });
      await redis.ping();
    } catch {
      redis = null;
    }
  }
  return redis;
}

async function getStore(key) {
  const client = await getRedis();
  if (client) {
    try {
      return await client.get(key);
    } catch {
      return memStore[key];
    }
  }
  return memStore[key];
}

async function setStore(key, value) {
  const client = await getRedis();
  if (client) {
    try {
      await client.set(key, value);
    } catch {
      memStore[key] = value;
    }
  }
  memStore[key] = value;
}

export async function getGuesses() {
  return (await getStore("guesses")) || [];
}

export async function addGuess(guess) {
  const guesses = (await getStore("guesses")) || [];
  guesses.push(guess);
  await setStore("guesses", guesses);
  return guess;
}

export async function deleteGuess(id) {
  const guesses = (await getStore("guesses")) || [];
  const filtered = guesses.filter(g => g.id !== id);
  await setStore("guesses", filtered);
  return filtered.length < guesses.length;
}

export async function getAnswers() {
  return (await getStore("answers")) || null;
}

export async function setAnswers(dog1, dog2) {
  const answers = { dog1, dog2 };
  await setStore("answers", answers);
  await setStore("revealed", false);
  return answers;
}

export async function getRevealed() {
  return !!(await getStore("revealed"));
}

export async function reveal() {
  const answers = await getAnswers();
  if (!answers) throw new Error("No answers set yet");

  const guesses = await getGuesses();

  function scoreDog(guessBreeds, answerBreeds) {
    const names = answerBreeds.map(e => (typeof e === "string" ? e : e.breed || "").toLowerCase());
    const set = new Set(names);
    const matches = guessBreeds.filter(b => set.has(b.toLowerCase())).length;
    if (matches === names.length && guessBreeds.length === names.length) return "correct";
    if (matches > 0) return "close";
    return "wrong";
  }

  guesses.forEach(g => {
    const s1 = scoreDog(g.dog1, answers.dog1);
    const s2 = scoreDog(g.dog2, answers.dog2);

    g.score1 = s1;
    g.score2 = s2;

    if (s1 === "correct" && s2 === "correct") g.score = "correct";
    else if (s1 !== "wrong" || s2 !== "wrong") g.score = "close";
    else g.score = "wrong";
  });

  await setStore("guesses", guesses);
  await setStore("revealed", true);
  return guesses;
}
