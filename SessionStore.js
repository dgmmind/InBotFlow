import { createClient } from "redis";
import dotenv from "dotenv";
dotenv.config();

// ----------------------
// Cliente Redis global
// ----------------------
let redisClient = null;

export async function getRedisClient() {
  if (!redisClient) {
    const url = process.env.REDIS_URL || process.env.REDIS_PUBLIC_URL;
    if (!url) throw new Error("❌ No se encontró REDIS_URL ni REDIS_PUBLIC_URL");

    redisClient = createClient({ url });

    redisClient.on("error", (err) => console.error("Redis error:", err.message));
    redisClient.on("end", () => {
      console.warn("⚠️ Redis connection closed");
      redisClient = null; // permitir reconexión
    });

    await redisClient.connect();
    console.log("✅ Redis conectado a", url);
  }

  return redisClient;
}

// ----------------------
// SessionStoreMemory
// ----------------------
export class SessionStoreMemory {
  constructor() {
    this.sessions = new Map();
  }

  async get(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  async set(sessionId, data, ttl = 3600) {
    this.sessions.set(sessionId, data);
    if (ttl > 0) setTimeout(() => this.sessions.delete(sessionId), ttl * 1000);
  }

  async delete(sessionId) {
    return this.sessions.delete(sessionId);
  }

  async all() {
    const obj = {};
    for (const [k, v] of this.sessions.entries()) obj[k] = v;
    return obj;
  }
}

// ----------------------
// SessionStoreRedis seguro
// ----------------------
export class SessionStoreRedis {
  constructor(redisClient) {
    this.redisClient = redisClient;
  }

  async get(sessionId) {
    const data = await this.redisClient.get(sessionId);
    if (!data) return null;
    try {
      return JSON.parse(data);
    } catch {
      return data; // si no es JSON, devolver tal cual
    }
  }

  async set(sessionId, data, ttl = 3600) {
    // Convierte cualquier dato a string seguro para Redis
    let value;
    if (data === undefined || data === null) value = "null";
    else if (typeof data === "string") value = data;
    else value = JSON.stringify(data);

    return await this.redisClient.set(sessionId, value, { EX: ttl });
  }

  async delete(sessionId) {
    return await this.redisClient.del(sessionId);
  }

  async all() {
    const keys = await this.redisClient.keys("*");
    const sessions = {};
    for (const key of keys) {
      const data = await this.redisClient.get(key);
      try {
        sessions[key] = JSON.parse(data);
      } catch {
        sessions[key] = data;
      }
    }
    return sessions;
  }

  shutdown = async ({ flush = false } = {}) => {
    if (flush) {
      const keys = await this.redisClient.keys("*");
      if (keys.length) await this.redisClient.del(keys);
    }
    await this.redisClient.quit();
    console.log("👋 Redis cerrado correctamente");
  };
}
