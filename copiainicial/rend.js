import fs from "fs";
import readline from "readline";
import { SessionStoreMemory, SessionStoreRedis, getRedisClient } from "./SessionStore.js";
import { FlowManager } from "./FlowManager.js";  // ✅ Importamos la clase separada

const config = {
  strictMode: true,
  storage: "redis"
};

const flows = JSON.parse(fs.readFileSync("./data.json", "utf8"));

let store;

async function main() {
  if (config.storage === "redis") {
    const redisClient = await getRedisClient();
    store = new SessionStoreRedis(redisClient);
  } else {
    store = new SessionStoreMemory();
  }

  const bot = new FlowManager(flows, store, config); // ✅ Instanciamos aquí

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log("Escribe un mensaje para el bot...");

  rl.on("line", async (line) => {
    const reply = await bot.handleMessage("50688888888", line.trim());
    console.log("Bot:", reply);
    console.log("Sesiones:", await store.all());
  });
}

process.on("SIGINT", async () => {
  if (store.shutdown) await store.shutdown({ flush: process.env.RESET_REDIS === "true" });
  process.exit(0);
});

process.on("SIGTERM", async () => {
  if (store.shutdown) await store.shutdown({ flush: process.env.RESET_REDIS === "true" });
  process.exit(0);
});

main();