const fs = require("fs")
const readline = require("readline")

// ----------------------
// Config
// ----------------------
const config = {
  strictMode: true
}

// 🔥 Cargar flows desde JSON
const flows = JSON.parse(fs.readFileSync("./data.json", "utf8"))

// ----------------------
// FlowManager
// ----------------------
class FlowManager {
  constructor(flows) {
    this.sessions = new Map()
    this.flowById = {}
    this.flowByAlias = {}

    for (const alias in flows) {
      const flow = flows[alias]
      this.flowById[flow.id] = flow
      this.flowByAlias[alias] = flow
    }
  }

  findFlowByTrigger(message) {
    const msg = message.toLowerCase()
    for (const alias in this.flowByAlias) {
      const flow = this.flowByAlias[alias]
      if (flow.triggers?.some(t => msg.includes(t))) {
        return flow
      }
    }
    return null
  }

  startSession(phone, flow, triggerMsg) {
    const session = { flow: flow.id, step: 0, data: { trigger: triggerMsg } }
    this.sessions.set(phone, session)
    return this.render(flow.steps[0].question, session.data)
  }

 advanceSession(phone, message) {
  const session = this.sessions.get(phone)
  const flow = this.flowById[session.flow]
  const step = flow.steps[session.step]

  let respuesta = message.toLowerCase()

  // ✅ Manejo de opciones (números o palabras)
  if (step.options) {
    let match = null
    for (const key in step.options) {
      const posibles = step.options[key].map(o => o.toLowerCase())
      if (posibles.includes(respuesta)) {
        match = key // valor "normalizado"
        break
      }
    }
    if (match) {
      session.data[step.key] = match
    } else {
      return "❌ Opción no válida, intenta otra vez."
    }
  } else if (step.key) {
    // Guardamos directamente lo que escribió
    session.data[step.key] = message
  }

  console.log("Sesiones:", this.sessions)

  // 🚀 Subflows
  if (step.subflows) {
    for (const subflowId in step.subflows) {
      if (step.subflows[subflowId].some(t => respuesta.includes(t))) {
        const targetFlow = this.flowById[subflowId]
        session.flow = targetFlow.id
        session.step = 0
        return targetFlow.steps[0].question
      }
    }
    return "❌ Opción no válida"
  }

  // 👉 Avanzar al siguiente paso
  session.step++

  // ✅ Todavía quedan pasos → seguimos normalmente
  if (session.step < flow.steps.length) {
    const next = flow.steps[session.step]
    console.log("👉 Sesiones activas antes de avanzar:", this.sessions)

    // Si el próximo paso no pide respuesta (key=null) o marca fin
    if (next.key === null || next.end) {
      this.sessions.delete(phone)
    }

    console.log("👉 Sesiones activas después de avanzar:", this.sessions)
    return this.render(next.question, session.data)
  }

  // ✅ Si ya no hay más pasos, mostrar último mensaje y cerrar sesión inmediatamente
  this.sessions.delete(phone)
  const lastStep = flow.steps[flow.steps.length - 1]
  return this.render(lastStep.question, session.data)
}


  render(template, data) {
    return template.replace(/{{(\w+)}}/g, (_, key) => data[key] || "")
  }

  handleMessage(phone, message) {
    if (!this.sessions.has(phone)) {
      const flow = this.findFlowByTrigger(message)
      if (flow) return this.startSession(phone, flow, message)
      return config.strictMode
        ? "No entendí tu mensaje."
        : this.startSession(phone, this.flowByAlias.main, message)
    }
    
    return this.advanceSession(phone, message)
  }
}

// ----------------------
// Demo consola
// ----------------------
const bot = new FlowManager(flows)
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

console.log("Escribe un mensaje para el bot...")

rl.on("line", (line) => {
  const reply = bot.handleMessage("50688888888", line.trim())
  console.log("Bot:", reply)
})
