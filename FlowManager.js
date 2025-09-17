// FlowManager.js
export class FlowManager {
  constructor(flows, sessionStore, config) {
    this.sessions = sessionStore;

    this.flowById = {};
    this.flowByAlias = {};
    this.config = config;

    for (const alias in flows) {
      const flow = flows[alias];
      this.flowById[flow.id] = flow;
      this.flowByAlias[alias] = flow;
    }

    this.validateFlows();
  }

  findFlowByTrigger(message) {
    const msg = message.toLowerCase();
    for (const alias in this.flowByAlias) {
      const flow = this.flowByAlias[alias];
      if (flow.type !== "main") continue;
      if (flow.triggers?.some(t => msg.includes(t))) {
        return flow;
      }
    }
    return null;
  }

  async startSession(phone, flow, triggerMsg) {
    const session = { flow: flow.id, step: 0, data: { trigger: triggerMsg } };
    await this.sessions.set(phone, session);
    return this.render(flow.steps[0].question, session.data);
  }

  async advanceSession(phone, message) {
    const session = await this.sessions.get(phone);
    if (!session) return "⚠️ Sesión no encontrada";

    const flow = this.flowById[session.flow];
    const step = flow.steps[session.step];

    let respuesta = message.toLowerCase();

    if (step.options) {
      let match = null;
      for (const key in step.options) {
        const posibles = step.options[key].map(o => o.toLowerCase());
        if (posibles.includes(respuesta)) {
          match = key;
          break;
        }
      }
      if (match) {
        session.data[step.key] = match;
      } else {
        return "❌ Opción no válida, intenta otra vez.";
      }
    } else if (step.key) {
      session.data[step.key] = message;
    }

    console.log("Sesiones:", await this.sessions.all());

    if (step.subflows) {
      for (const subflowId in step.subflows) {
        const [trigger, palabra] = step.subflows[subflowId];
        if (trigger.toLowerCase() === respuesta || palabra.toLowerCase() === respuesta) {
          const targetFlow = this.flowById[subflowId];
          if (targetFlow.type !== "subflow") {
            throw new Error(`Invalid subflow type for ID ${subflowId}. Expected "subflow", got "${targetFlow.type}"`);
          }
          session.flow = targetFlow.id;
          session.step = 0;
          // 🔹 Guardar la palabra bonita directamente desde el array
          if (step.key) session.data[step.key] = palabra;
          await this.sessions.set(phone, session);
          return targetFlow.steps[0].question;
        }
      }
      return "❌ Opción no válida";
    }
    

    session.step++;
    if (session.step < flow.steps.length) {
      const next = flow.steps[session.step];
      if (next.key === null) {
        // 🔹 Guardar la última respuesta del usuario en session.data
        if (step.key) {
          console.log("Guardando respuesta:", step.key, message);
          await this.sessions.set(phone, session);
      }
        const reply = this.render(next.question, session.data);
        console.log("👉 Sesión eliminada:", await this.sessions.all());
        await this.sessions.delete(phone);
        
        return reply;
      }
      await this.sessions.set(phone, session);
      return this.render(next.question, session.data);
    } else {
      await this.sessions.delete(phone);
      return "✅ Flujo completado.";
    }
  }

  

  validateFlows() {
    for (const alias in this.flowByAlias) {
      const flow = this.flowByAlias[alias];
      if (flow.type === "main") {
        if (!flow.triggers || flow.triggers.length === 0) {
          throw new Error(`Main flow "${alias}" (ID ${flow.id}) must have triggers array`);
        }
      } else if (flow.type === "subflow") {
        if (flow.triggers && flow.triggers.length > 0) {
          throw new Error(`Subflow "${alias}" (ID ${flow.id}) should not have triggers`);
        }
      } else {
        throw new Error(`Unknown flow type "${flow.type}" for "${alias}" (ID ${flow.id}). Use "main" or "subflow"`);
      }

     
      for (const step of flow.steps) {
        if (step.subflows) {
          for (const subflowId in step.subflows) {
            if (!this.flowById[subflowId]) {
              throw new Error(`Subflow ID "${subflowId}" referenced in step of flow "${alias}" does not exist`);
            }
          }
        }
      }
    }
    console.log("✅ Flows validated successfully");
  }

  render(template, data) {
    return template.replace(/{{(\w+)}}/g, (_, key) => data[key] || "");
  }

  async handleMessage(phone, message) {
    const existing = await this.sessions.get(phone);
    if (!existing) {
      const flow = this.findFlowByTrigger(message);
      if (flow) return this.startSession(phone, flow, message);
      return this.config.strictMode
        ? "No entendí tu mensaje."
        : this.startSession(phone, this.flowByAlias.main, message);
    }
    return this.advanceSession(phone, message);
  }
}
