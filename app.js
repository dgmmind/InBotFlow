import { makeWASocket, useMultiFileAuthState, DisconnectReason, makeCacheableSignalKeyStore, Browsers } from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';

export class WhatsAppService {
    constructor() {
        this.sock = null;
        this.authState = null;
        this.isConnected = false;
    }

    shouldProcessMessage(msg, type) {
        if (type !== 'notify') return false;
        if (msg.key.fromMe) return false;
        if (!msg.message) return false;
        if (msg.message.protocolMessage || msg.message.senderKeyDistributionMessage) return false;
        return true;
    }

    registerMessageHandler() {
        this.sock.ev.removeAllListeners('messages.upsert');
        this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
            for (const msg of messages) {
                if (!this.shouldProcessMessage(msg, type)) continue;
                const { key } = msg;
                const from = key.remoteJid;
                const sender = key.participant || from;
                console.log(`Mensaje recibido de: ${sender}`);
                await this.sock.sendMessage(from, { text: '¡Mensaje recibido!' });
            }
        });
    }

    async connect() {
        const { state, saveCreds } = await useMultiFileAuthState('./sessions');
        this.authState = { state, saveCreds };
        const log = pino({ level: 'error' });

        this.sock = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, log),
            },
            browser: Browsers.windows('Desktop'),
            syncFullHistory: false,
            logger: log,
            shouldIgnoreJid: (jid) => /@g\.us/.test(jid) || jid === 'status@broadcast' || /@broadcast/.test(jid)
        });

        this.sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
            if (qr) {
                console.log('🔐 Escanea este código QR para vincular tu WhatsApp:');
                qrcode.generate(qr, { small: true });
            }
            if (connection === 'close') {
                this.isConnected = false;
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                if (shouldReconnect) {
                    console.log('Reconectando en 3 segundos...');
                    setTimeout(() => this.connect(), 3000);
                } else {
                    console.log('Conexión cerrada por logout. Escanea el QR nuevamente.');
                }
            } else if (connection === 'open') {
                this.isConnected = true;
                console.log('✅ Conexión establecida con WhatsApp');
                this.registerMessageHandler();
            }
        });

        this.sock.ev.on('lid-mapping.update', (mapping) => {
            console.log('LID mapping updated:', mapping);
        });

        this.sock.ev.on('creds.update', this.authState.saveCreds);
    }

    async sendMessage(to, text) {
        if (!this.sock) throw new Error('No hay conexión activa. Llama a connect() primero.');
        return await this.sock.sendMessage(to, { text });
    }

    async disconnect() {
        if (this.sock) {
            await this.sock.logout();
            this.sock = null;
            this.isConnected = false;
            console.log('Conexión desconectada.');
        }
    }
}

const whatsappService = new WhatsAppService();
whatsappService.connect();
