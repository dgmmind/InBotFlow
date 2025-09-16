import { BaileysService } from './BaileysService.js';
import { Manager } from './Manager.js';


async function main() {
 
  // Iniciar servicio de WhatsApp
  const service = new BaileysService();
  await service.connect();

  // Manejar cierre graceful
  process.on("SIGINT", async () => {
    console.log('Cerrando servidor...');
    await Manager.getInstance().shutdown();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    console.log('Cerrando servidor...');
    await Manager.getInstance().shutdown();
    process.exit(0);
  });
}

main();
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = 3000;

// __dirname equivalente en ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware para parsear JSON
app.use(express.json());

// Servir archivos estáticos desde la carpeta "public"
app.use(express.static(path.join(__dirname, "public")));

// Servir el archivo data.json estáticamente
app.use('/data.json', express.static(path.join(__dirname, "data.json")));

// Ruta principal -> mostrará index.html automáticamente
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Endpoint para guardar el JSON
app.post('/save-json', async (req, res) => {
  try {
    const fs = await import('fs');
    const jsonData = JSON.stringify(req.body, null, 2);
    fs.writeFileSync(path.join(__dirname, 'data.json'), jsonData, 'utf8');
    res.status(200).json({ message: 'JSON guardado exitosamente' });
  } catch (error) {
    console.error('Error al guardar JSON:', error);
    res.status(500).json({ error: 'Error al guardar el archivo JSON' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});