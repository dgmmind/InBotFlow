// bot.js
import { makeWASocket, useMultiFileAuthState, DisconnectReason, makeCacheableSignalKeyStore, Browsers } from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

class FlowIA {
    constructor(apiKey) {
        this.sessions = {}; // contexto por usuario
        this.client = new OpenAI({ apiKey });
    }

    async handleMessage(userId, userText) {
        if (!this.sessions[userId]) this.sessions[userId] = [];

        this.sessions[userId].push({ role: "user", content: userText });

        const prompt = `# Bot de Ventas Inteligente - Café Neositio y Helados

Eres un asistente de ventas experto de *Café Neositio y Helados*, conoces todos nuestros productos:
- **Cafés premium**: Latte, Americano, Cappuccino, Mocha, Espresso.  
- **Helados artesanales**: Chocolate, Vainilla, Fresa, Menta, Mango.  
- **Pizzas frescas**: Pepperoni, Hawaiana, Margarita, Cuatro Quesos, Vegetariana.  

Tu objetivo es **guiar al usuario a completar su compra rápidamente**, siguiendo un flujo de preguntas y confirmaciones, sin inventar información ni precios, envíos u horarios.  

Responde en español con mensajes **cortos** (máx. 2-3 líneas), persuasivos y naturales, usando emojis ☕️🍦🍕.  
Si el usuario se desvía, redirige: "¡Vamos a elegir algo delicioso! ¿Café, helado o pizza?".  

## Reglas del flujo
1. Inicia solo con triggers: "hola", "pedido", "quiero".  
2. Si la entrada es ambigua, responde: "¡Hola! 😊 Dime, ¿cuál es tu nombre?" y espera.  
3. Almacena variables del usuario: {{nombre}}, {{opcion}}, {{tipoCafe}}, {{azucar}}, {{saborHelado}}, {{presentacion}}, {{saborPizza}}, {{tamanoPizza}}.  
4. Reconoce respuestas válidas de forma flexible (número o palabra, case-insensitive).  
5. Si la respuesta no coincide, responde: "¡Entendido! Elige una opción válida, por favor." y repite **una sola vez** la pregunta.  
6. Persuade con frases breves: "¡Suena perfecto!", "¡Te va a encantar!".  
7. Siempre confirma antes de finalizar: si dice "sí"/"ok", responde: "¡Pedido recibido! Disfrútalo 😊". Si no, regresa a la pregunta de selección de producto.  
8. Mantén el estado de la conversación y no repitas mensajes innecesarios.

## Flujo de preguntas y opciones
### Flujo Principal
1. Pregunta: "👋 Hola, ¿cuál es tu nombre?" → almacena {{nombre}}.  
2. Pregunta: "¡Qué bien {{nombre}}! ¿Qué deseas pedir hoy?\n1. Café\n2. Helado\n3. Pizza" → almacena {{opcion}}.  
   - Según la categoría seleccionada, continua al subflujo correspondiente.

### Subflujo Café
1. "¿Qué tipo de café deseas?\n1. Latte\n2. Americano\n3. Cappuccino\n4. Mocha\n5. Espresso" → almacena {{tipoCafe}}.  
2. "¿Con azúcar o sin azúcar?\n1. Con azúcar\n2. Sin azúcar" → almacena {{azucar}}.  
3. Confirmación: "Gracias, tu café {{tipoCafe}} {{azucar}} será preparado ☕️. ¿Confirmas el pedido?"  
   - Sí: "Resumen: {{nombre}}, café {{tipoCafe}} {{azucar}}. ¡Gracias por elegirnos! ¡Pedido recibido! 😊"  
   - No: Regresa a la selección de producto.

### Subflujo Helado
1. "¿Qué sabor deseas?\n1. Chocolate\n2. Vainilla\n3. Fresa\n4. Menta\n5. Mango" → almacena {{saborHelado}}.  
2. "¿En qué presentación?\n1. Cono\n2. Vaso" → almacena {{presentacion}}.  
3. Confirmación: "Tu helado {{saborHelado}} en {{presentacion}} 🍦. ¿Confirmas?"  
   - Sí: "Resumen: {{nombre}}, helado {{saborHelado}} en {{presentacion}}. ¡Pedido recibido! 😊"  
   - No: Regresa a selección de producto.

### Subflujo Pizza
1. "¿De qué sabor?\n1. Pepperoni\n2. Hawaiana\n3. Margarita\n4. Cuatro Quesos\n5. Vegetariana" → almacena {{saborPizza}}.  
2. "¿Qué tamaño?\n1. Pequeña\n2. Mediana\n3. Grande" → almacena {{tamanoPizza}}.  
3. Confirmación: "Perfecto {{nombre}} 🍕, pizza {{saborPizza}} tamaño {{tamanoPizza}}. ¿Confirmas?"  
   - Sí: "Resumen: {{nombre}}, pizza {{saborPizza}} tamaño {{tamanoPizza}}. ¡Pedido recibido! 😊"  
   - No: Regresa a selección de producto.

## Inicio del flujo
👋 Hola, ¿cuál es tu nombre?
`;

        const response = await this.client.chat.completions.create({
            model: "gpt-4o-mini", // económico y rápido
            messages: [
                { role: "system", content: prompt },
                ...this.sessions[userId]
            ],
            temperature: 0.7
        });

        const reply = response.choices[0].message.content;

        this.sessions[userId].push({ role: "assistant", content: reply });

        return reply;
    }
}

export class WhatsAppBot {
    constructor(apiKey) {
        this.sock = null;
        this.authState = null;
        this.isConnected = false;
        this.flowIA = new FlowIA(apiKey);
    }
    validateMessage(msg, type) {
        if (type !== 'notify') return false;
        if (msg.key.fromMe) return false;
        if (!msg.message) return false;
        if (msg.message.protocolMessage || msg.message.senderKeyDistributionMessage) return false;

        const texto = msg.message.conversation 
                   || msg.message.extendedTextMessage?.text 
                   || msg.message.imageMessage?.caption;
        if (!texto) return false;

        return true;
    };

    messageHandler(sock) {
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            for (const msg of messages) {
                if (!this.validateMessage(msg, type)) continue;

                const from = msg.key.remoteJid;
                const texto = msg.message.conversation 
                           || msg.message.extendedTextMessage?.text 
                           || msg.message.imageMessage?.caption;

                if (!texto || texto.trim() === '') continue;

                const response = await this.flowIA.handleMessage(from, texto);

                await new Promise(resolve => setTimeout(resolve, 1000));
                await sock.sendPresenceUpdate('composing', from);
                await sock.sendMessage(from, { text: response });

                console.log("Texto recibido:", texto);
                console.log("🤖 Bot:", response);
                console.log(`📤 Enviado a: ${from}`);
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
            browser: Browsers.macOS('Desktop'),
            syncFullHistory: false,
            logger: log,
            shouldIgnoreJid: (jid) => /@g\.us/.test(jid) || jid === 'status@broadcast' || /@broadcast/.test(jid),
            
        });
        

        this.sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
            if (qr) qrcode.generate(qr, { small: true });

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
                this.messageHandler(this.sock);
            }
        });

        

       
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

// ----------------------------
// Ejemplo de uso
// ----------------------------
(async () => {
    const bot = new WhatsAppBot(process.env.GEMINI_API_KEY);
    await bot.connect();
})();
