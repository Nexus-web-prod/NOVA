"use strict";

const nativePostMessage = MessagePort.prototype.postMessage;
let supportsStreamTransfer = null;
let transport = null;
let transportName = "";

function post(port, message, transfer = []) {
  nativePostMessage.call(port, message, transfer);
}

function reportError(port, error, operation) {
  console.error(`error while processing '${operation}':`, error);
  port.postMessage({ type: "error", error });
}

function canTransferStreams() {
  if (supportsStreamTransfer !== null) return supportsStreamTransfer;
  const channel = new MessageChannel();
  const stream = new ReadableStream();
  try {
    post(channel.port1, stream, [stream]);
    supportsStreamTransfer = true;
  } catch (_) {
    supportsStreamTransfer = false;
  }
  return supportsStreamTransfer;
}

function noTransportError() {
  return new Error("There are no Bare clients", {
    cause: "No BareTransport was set. Call setTransport() before using BareClient."
  });
}

async function loadTransport(client) {
  if (client.function === "bare-mux-remote") {
    transport = client.args[0];
    transportName = `bare-mux-remote (${client.args[1]})`;
    return;
  }

  const source = String(client.function || "");
  const importMatch = source.match(/await\s+import\("([^"\r\n]+)"\)/);
  const nameMatch = source.match(/return\s*\[BareTransport,\s*"([^"\r\n]+)"\s*\]/);
  if (!importMatch || !nameMatch || importMatch[1] !== nameMatch[1]) {
    throw new Error("Unsupported BareMux transport loader");
  }

  const moduleUrl = new URL(importMatch[1], self.location.href);
  if (moduleUrl.origin !== self.location.origin || moduleUrl.pathname !== "/proxy/epoxy.mjs") {
    throw new Error("Nova only permits the local Epoxy transport");
  }

  const module = await import(moduleUrl.href);
  const BareTransport = module.default;
  if (typeof BareTransport !== "function") throw new Error("Epoxy transport is unavailable");
  transport = new BareTransport(...client.args);
  transportName = importMatch[1];
}

async function handleFetch(message, port, activeTransport) {
  const response = await activeTransport.request(
    new URL(message.fetch.remote),
    message.fetch.method,
    message.fetch.body,
    message.fetch.headers,
    null
  );

  if (!canTransferStreams() && response.body instanceof ReadableStream) {
    response.body = await new Response(response.body).arrayBuffer();
  }

  if (response.body instanceof ReadableStream || response.body instanceof ArrayBuffer) {
    post(port, { type: "fetch", fetch: response }, [response.body]);
  } else {
    post(port, { type: "fetch", fetch: response });
  }
}

function forwardToRemote(message, port) {
  const transfer = [port];
  if (message.fetch?.body) transfer.push(message.fetch.body);
  if (message.websocket?.channel) transfer.push(message.websocket.channel);
  post(transport, { message, port }, transfer);
}

async function handleWebSocket(message, port, activeTransport) {
  const [send, close] = activeTransport.connect(
    new URL(message.websocket.url),
    message.websocket.protocols,
    message.websocket.requestHeaders,
    protocol => post(message.websocket.channel, { type: "open", args: [protocol] }),
    data => post(
      message.websocket.channel,
      { type: "message", args: [data] },
      data instanceof ArrayBuffer ? [data] : []
    ),
    (code, reason) => post(message.websocket.channel, { type: "close", args: [code, reason] }),
    error => post(message.websocket.channel, { type: "error", args: [error] })
  );

  message.websocket.channel.onmessage = event => {
    if (event.data.type === "data") send(event.data.data);
    if (event.data.type === "close") close(event.data.closeCode, event.data.closeReason);
  };
  post(port, { type: "websocket" });
}

function bindPort(workerPort) {
  workerPort.onmessage = async event => {
    const port = event.data.port;
    const message = event.data.message;

    if (message.type === "ping") {
      post(port, { type: "pong" });
      return;
    }

    if (message.type === "set") {
      try {
        await loadTransport(message.client);
        console.log("set transport to", transport, transportName);
        post(port, { type: "set" });
      } catch (error) {
        reportError(port, error, "set");
      }
      return;
    }

    if (message.type === "get") {
      port.postMessage({ type: "get", name: transportName });
      return;
    }

    if (message.type === "fetch") {
      try {
        if (!transport) throw noTransportError();
        if (transport instanceof MessagePort) {
          forwardToRemote(message, port);
          return;
        }
        if (!transport.ready) await transport.init();
        await handleFetch(message, port, transport);
      } catch (error) {
        reportError(port, error, "fetch");
      }
      return;
    }

    if (message.type === "websocket") {
      try {
        if (!transport) throw noTransportError();
        if (transport instanceof MessagePort) {
          forwardToRemote(message, port);
          return;
        }
        if (!transport.ready) await transport.init();
        await handleWebSocket(message, port, transport);
      } catch (error) {
        reportError(port, error, "websocket");
      }
    }
  };
}

new BroadcastChannel("bare-mux").postMessage({ type: "refreshPort" });
self.onconnect = event => bindPort(event.ports[0]);
console.debug("bare-mux: running Nova CSP-safe v2.1.7 worker");
