// Manager.js
import { FlowManager } from "./FlowManager.js";
import { SessionStoreMemory, SessionStoreRedis, getRedisClient } from "./SessionStore.js";

// consola
import readline from "readline";
// consola end

import fs from "node:fs";

const config = {
  strictMode: true,
  storage: "redis",
};

export class Manager {
  static instance = null;

  static getInstance() {
    if (!Manager.instance) {
      Manager.instance = new Manager();
    }
    return Manager.instance;
  }

  constructor() {
    this.bot = null;
    this.store = null;
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;

    let flows;
    const apiUrl = process.env.API_URL;
    if (apiUrl) {
      try {
        console.log(`Loading flows from API: ${apiUrl}/flows`);
        const response = await fetch(`${apiUrl}/flows`);
        if (response.ok) {
          flows = await response.json();
          console.log('Flows loaded from API successfully');
        } else {
          throw new Error(`API response not OK: ${response.status}`);
        }
      } catch (err) {
        console.warn('Failed to load flows from API, falling back to local data.json:', err.message);
        flows = JSON.parse(fs.readFileSync("./data.json", "utf8"));
      }
    } else {
      flows = JSON.parse(fs.readFileSync("./data.json", "utf8"));
    }

    if (config.storage === "redis") {
      const redisClient = await getRedisClient();
      this.store = new SessionStoreRedis(redisClient);
    } else {
      this.store = new SessionStoreMemory();
    }

    this.bot = new FlowManager(flows, this.store, config);
    this.initialized = true;

    // consola start
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    })
      
    console.log("Escribe un mensaje para el bot...")
      
    rl.on("line", async (line) => {
        const reply =  await this.bot.handleMessage("50688888888", line.trim())
        console.log("Bot:", reply)
    })
    // consola end
  }
  validateMessage(msg, type) {
    if (type !== 'notify') return false;             // solo mensajes reales
    if (msg.key.fromMe) return false;               // ignorar propios
    if (!msg.message) return false;                 // mensaje vacío
    if (msg.message.protocolMessage || msg.message.senderKeyDistributionMessage) return false;  // sistema

    // 🚫 Ignorar mensajes sin texto
    const texto = msg.message.conversation 
               || msg.message.extendedTextMessage?.text 
               || msg.message.imageMessage?.caption;

    if (!texto) {
        console.log("🚫 Mensaje sin texto, ignorando...");
        return false;
    }

    return true;
}

  async attach(sock) {
    await this.init();
    sock.ev.removeAllListeners('messages.upsert');


    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        for (const msg of messages) {
            if (!this.validateMessage(msg, type)) continue;
            const { key } = msg;
            const from = key.remoteJid;
            const sender = key.participant || from;
         

            const texto = msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption ||
            null;

            console.log("📥 Message Received:");
            console.log(`From: ${sender}`);
            console.log(`Text: ${texto}`);

            const respuesta = await this.bot.handleMessage(sender, texto);
            console.log("🤖 Bot:", respuesta);
            await sock.sendMessage(from, { text: respuesta });
        }
    });
}

  async shutdown() {
    if (this.store?.shutdown) {
      await this.store.shutdown({ flush: process.env.RESET_REDIS === "true" });
    }
  }
}
