// src/useIframeMac.ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
var DEFAULT_HUB = {
  url: "https://pzlakqqnkvogtfvippvx.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6bGFrcXFua3ZvZ3RmdmlwcHZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0NTQzOTYsImV4cCI6MjA5MzAzMDM5Nn0.uHbz-Ft4MCLbcMPAS-tFMQhDny7XCkevUD-fBgW0euQ"
};
var uid = () => typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
var notifySupported = () => typeof window !== "undefined" && "Notification" in window;
var secretKey = (channel) => `tb-secret:${channel}`;
var readSecret = (channel) => {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(secretKey(channel)) || "";
  } catch {
    return "";
  }
};
var writeSecret = (channel, s) => {
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(secretKey(channel), s);
  } catch {
  }
};
async function signMessage(secret, id, ts, text) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const buf = await crypto.subtle.sign("HMAC", key, enc.encode(`${id}.${ts}.${text}`));
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
var notifyPrefKey = (channel) => `tb-notify:${channel}`;
var readNotifyPref = (channel) => {
  try {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(notifyPrefKey(channel)) !== "0";
  } catch {
    return true;
  }
};
var writeNotifyPref = (channel, on) => {
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(notifyPrefKey(channel), on ? "1" : "0");
  } catch {
  }
};
var VALID_MODES = ["direct", "queue", "terminal"];
var modeKey = (channel) => `tb-mode:${channel}`;
var readMode = (channel, fallback) => {
  try {
    if (typeof window === "undefined") return fallback;
    const v = window.localStorage.getItem(modeKey(channel));
    return v && VALID_MODES.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
};
var writeMode = (channel, m) => {
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(modeKey(channel), m);
  } catch {
  }
};
var audioCtx = null;
function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audioCtx = audioCtx || new Ctx();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.05;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.12);
  } catch {
  }
}
async function captureScreenSmall(maxB64 = 18e4) {
  try {
    const { domToJpeg } = await import("modern-screenshot");
    const vw = window.innerWidth || 720;
    const scale = Math.min(1, 720 / vw);
    for (const quality of [0.6, 0.45, 0.3]) {
      const dataUrl = await domToJpeg(document.body, {
        quality,
        scale,
        backgroundColor: "#ffffff",
        filter: (node) => !(node instanceof HTMLElement && node.dataset?.iframeMacIgnore === "true")
      });
      const b64 = dataUrl.split(",")[1] || "";
      if (b64.length <= maxB64) return dataUrl;
    }
    return null;
  } catch {
    return null;
  }
}
function useIframeMac(opts = {}) {
  const { supabase, channel = "iframe-mac", enabled = true, captureMobileScreen = true, notify = true, defaultMode = "direct" } = opts;
  const client = useMemo(
    () => supabase ?? createClient(DEFAULT_HUB.url, DEFAULT_HUB.anonKey, { auth: { persistSession: false } }),
    [supabase]
  );
  const [messages, setMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [online, setOnline] = useState(false);
  const channelRef = useRef(null);
  const pendingAcks = useRef(/* @__PURE__ */ new Map());
  const [secret, setSecret] = useState(() => readSecret(channel));
  const locked = !secret;
  const unlock = useCallback((s) => {
    const trimmed = s.trim();
    writeSecret(channel, trimmed);
    setSecret(trimmed);
  }, [channel]);
  const [mode, setModeState] = useState(() => readMode(channel, defaultMode));
  const setMode = useCallback((m) => {
    writeMode(channel, m);
    setModeState(m);
  }, [channel]);
  useEffect(() => {
    setModeState(readMode(channel, defaultMode));
  }, [channel, defaultMode]);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const urlSecret = params.get("tb-secret");
    if (urlSecret) {
      unlock(urlSecret);
      params.delete("tb-secret");
      const newSearch = params.toString();
      const newUrl = window.location.pathname + (newSearch ? "?" + newSearch : "") + window.location.hash;
      window.history.replaceState(null, "", newUrl);
    }
    setSecret(readSecret(channel));
  }, [channel, unlock]);
  const [permission, setPermission] = useState(
    () => notifySupported() ? Notification.permission : "unsupported"
  );
  const [notifyOn, setNotifyOn] = useState(() => readNotifyPref(channel));
  useEffect(() => {
    setPermission(notifySupported() ? Notification.permission : "unsupported");
    setNotifyOn(readNotifyPref(channel));
  }, [channel]);
  const notificationsOn = notify && notifyOn && permission === "granted";
  const enableNotifications = useCallback(async () => {
    if (!notifySupported()) return;
    let p = Notification.permission;
    if (p === "default") {
      try {
        p = await Notification.requestPermission();
      } catch {
      }
    }
    setPermission(p);
    if (p === "granted") {
      setNotifyOn(true);
      writeNotifyPref(channel, true);
    }
  }, [channel]);
  const disableNotifications = useCallback(() => {
    setNotifyOn(false);
    writeNotifyPref(channel, false);
  }, [channel]);
  const flashRef = useRef(null);
  const stopFlash = useCallback(() => {
    if (flashRef.current) {
      clearInterval(flashRef.current.timer);
      document.title = flashRef.current.original;
      flashRef.current = null;
    }
  }, []);
  const startFlash = useCallback((label) => {
    if (typeof document === "undefined" || flashRef.current) return;
    const original = document.title;
    let on = false;
    const timer = setInterval(() => {
      document.title = (on = !on) ? label : original;
    }, 1e3);
    flashRef.current = { timer, original };
  }, []);
  useEffect(() => {
    const onVisible = () => {
      if (typeof document !== "undefined" && !document.hidden) stopFlash();
    };
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);
    if (typeof window !== "undefined") window.addEventListener("focus", onVisible);
    return () => {
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
      if (typeof window !== "undefined") window.removeEventListener("focus", onVisible);
      stopFlash();
    };
  }, [stopFlash]);
  const pushNotification = useCallback(
    (title, body) => {
      if (!notificationsOn) return;
      if (typeof document !== "undefined" && !document.hidden) return;
      try {
        new Notification(title, { body: (body || "").slice(0, 180), tag: channel });
      } catch {
      }
      beep();
      startFlash("\u{1F4AC} " + title);
    },
    [notificationsOn, channel, startFlash]
  );
  const notifyRef = useRef(pushNotification);
  notifyRef.current = pushNotification;
  useEffect(() => {
    if (!enabled) return;
    const ch = client.channel(channel, { config: { broadcast: { self: false } } });
    const akey = (id) => (id || uid()) + "-a";
    const upsertAssistant = (id, mut, seed) => setMessages((m) => {
      const key = akey(id);
      const idx = m.findIndex((x) => x.id === key);
      if (idx === -1) {
        return [...m, mut({ id: key, role: "assistant", content: "", ...seed })];
      }
      const copy = m.slice();
      copy[idx] = mut(copy[idx]);
      return copy;
    });
    ch.on("broadcast", { event: "assistant_delta" }, ({ payload }) => {
      upsertAssistant(payload.id, (msg) => ({ ...msg, content: msg.content + (payload.text || ""), streaming: true }));
      setIsStreaming(true);
    });
    ch.on("broadcast", { event: "tool_use" }, ({ payload }) => {
      if (!payload.summary) return;
      upsertAssistant(payload.id, (msg) => ({ ...msg, tools: [...msg.tools || [], payload.summary], streaming: true }));
      setIsStreaming(true);
    });
    ch.on("broadcast", { event: "assistant_msg" }, ({ payload }) => {
      upsertAssistant(payload.id, (msg) => ({ ...msg, content: payload.text, streaming: false }));
      setIsStreaming(false);
      notifyRef.current("Resposta do terminal", payload.text || "");
      ch.send({ type: "broadcast", event: "assistant_msg_ack", payload: { id: payload.id } }).catch(() => {
      });
    });
    ch.on("broadcast", { event: "user_msg_ack" }, ({ payload }) => {
      const resolve = pendingAcks.current.get(payload?.id);
      if (resolve) {
        resolve();
        pendingAcks.current.delete(payload.id);
      }
    });
    ch.on("broadcast", { event: "user_msg" }, ({ payload }) => {
      if (!payload?.id) return;
      setMessages((m) => m.some((x) => x.id === payload.id) ? m : [...m, { id: payload.id, role: "user", content: payload.text || "" }]);
      notifyRef.current("Nova mensagem no chat", payload.text || "");
    });
    const refresh = () => {
      const state = ch.presenceState();
      setOnline(Object.keys(state).length > 0);
    };
    ch.on("presence", { event: "sync" }, refresh);
    ch.on("presence", { event: "join" }, refresh);
    ch.on("presence", { event: "leave" }, refresh);
    ch.subscribe();
    channelRef.current = ch;
    return () => {
      client.removeChannel(ch);
      channelRef.current = null;
      setOnline(false);
    };
  }, [client, channel, enabled]);
  const sendMessage = useCallback(
    async (content) => {
      const text = content.trim();
      if (!text || isStreaming) return;
      const id = uid();
      setMessages((m) => [...m, { id, role: "user", content: text }]);
      if (!online) {
        setMessages((m) => [
          ...m,
          {
            id: id + "-off",
            role: "assistant",
            content: "\u26A0\uFE0F O terminal est\xE1 offline \u2014 liga o Mac e confirma que o daemon est\xE1 a correr (o indicador fica verde). Depois tenta de novo."
          }
        ]);
        return;
      }
      setIsStreaming(true);
      const ts = Date.now();
      const route = window.location.pathname + window.location.search;
      const device = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? "mobile" : "desktop";
      const image = device === "mobile" && captureMobileScreen ? await captureScreenSmall() : null;
      const sig = secret ? await signMessage(secret, id, ts, text).catch(() => void 0) : void 0;
      const msgPayload = { id, text, ts, sig, route, device, image, mode: modeRef.current };
      const MAX_RETRIES = 3;
      const ACK_TIMEOUT_MS = 6e3;
      const RETRY_DELAYS = [0, 2e3, 6e4];
      let delivered = false;
      for (let attempt = 0; attempt < MAX_RETRIES && !delivered; attempt++) {
        if (RETRY_DELAYS[attempt] > 0) await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
        await channelRef.current?.send({ type: "broadcast", event: "user_msg", payload: msgPayload });
        delivered = await new Promise((resolve) => {
          const timer = setTimeout(() => {
            pendingAcks.current.delete(id);
            resolve(false);
          }, ACK_TIMEOUT_MS);
          pendingAcks.current.set(id, () => {
            clearTimeout(timer);
            resolve(true);
          });
        });
      }
      if (!delivered) {
        setMessages((m) => [
          ...m,
          { id: id + "-no-ack", role: "assistant", content: "\u26A0\uFE0F Mensagem enviada mas o daemon n\xE3o confirmou recep\xE7\xE3o. Verifica se o iframe-mac est\xE1 online." }
        ]);
        setIsStreaming(false);
      }
    },
    [isStreaming, online, captureMobileScreen, secret, pendingAcks]
  );
  return {
    messages,
    isStreaming,
    online,
    sendMessage,
    mode,
    setMode,
    locked,
    unlock,
    notificationPermission: permission,
    notificationsOn,
    enableNotifications,
    disableNotifications
  };
}

// src/IframeMacChat.tsx
import { useEffect as useEffect2, useRef as useRef2, useState as useState2 } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var MODES = [
  { key: "direct", icon: "\u26A1", label: "Direto", hint: "Claude Code a correr na m\xE1quina (mac-3) \u2014 resposta imediata em streaming." },
  { key: "queue", icon: "\u{1F4CB}", label: "Fila", hint: "Enfileira como tarefa no dashboard (serializada, com hist\xF3rico) no alvo mac-3." },
  { key: "terminal", icon: "\u{1F5A5}\uFE0F", label: "Terminal", hint: "Shell tmux persistente em mac-3 \u2014 corre comandos e v\xEA a sa\xEDda ao vivo." }
];
function IframeMacChat({
  supabase,
  channel,
  enabled = true,
  title = "Terminal",
  placeholder = "Escreve uma mensagem\u2026",
  defaultMode = "direct"
}) {
  const {
    messages,
    isStreaming,
    online,
    sendMessage,
    mode,
    setMode,
    locked,
    unlock,
    notificationPermission,
    notificationsOn,
    enableNotifications,
    disableNotifications
  } = useIframeMac({ supabase, channel, enabled, defaultMode });
  const [input, setInput] = useState2("");
  const [codeInput, setCodeInput] = useState2("");
  const listRef = useRef2(null);
  useEffect2(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isStreaming]);
  const submit = () => {
    const t = input.trim();
    if (!t) return;
    setInput("");
    void sendMessage(t);
  };
  return /* @__PURE__ */ jsxs(
    "div",
    {
      "data-iframe-mac-ignore": "true",
      style: {
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#0b0f17",
        color: "#e5e7eb",
        fontFamily: "system-ui, -apple-system, sans-serif",
        fontSize: 14
      },
      children: [
        /* @__PURE__ */ jsx("style", { children: "@keyframes tb-blink{0%,49%{opacity:1}50%,100%{opacity:0}}.tb-caret{animation:tb-blink 1s step-end infinite;margin-left:1px}" }),
        /* @__PURE__ */ jsxs(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 14px",
              borderBottom: "1px solid #1f2937"
            },
            children: [
              /* @__PURE__ */ jsx("span", { style: { fontWeight: 600 }, children: title }),
              /* @__PURE__ */ jsxs(
                "span",
                {
                  style: {
                    marginLeft: "auto",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                    color: online ? "#22c55e" : "#ef4444"
                  },
                  children: [
                    /* @__PURE__ */ jsx(
                      "span",
                      {
                        style: {
                          width: 8,
                          height: 8,
                          borderRadius: 9999,
                          background: online ? "#22c55e" : "#ef4444",
                          boxShadow: online ? "0 0 6px #22c55e" : "none"
                        }
                      }
                    ),
                    online ? "online" : "offline"
                  ]
                }
              ),
              notificationPermission !== "unsupported" && /* @__PURE__ */ jsx(
                "button",
                {
                  onClick: () => notificationsOn ? disableNotifications() : void enableNotifications(),
                  title: notificationPermission === "denied" ? "Notifica\xE7\xF5es bloqueadas no browser \u2014 ativa-as nas defini\xE7\xF5es do site" : notificationsOn ? "Notifica\xE7\xF5es ligadas \u2014 clica para desligar" : "Ligar notifica\xE7\xF5es de novas mensagens",
                  style: {
                    marginLeft: 4,
                    background: "transparent",
                    border: "none",
                    color: notificationsOn ? "#22c55e" : "#6b7280",
                    cursor: "pointer",
                    fontSize: 13,
                    padding: 0
                  },
                  children: notificationsOn ? "\u{1F514}" : "\u{1F515}"
                }
              )
            ]
          }
        ),
        /* @__PURE__ */ jsx(
          "div",
          {
            title: MODES.find((x) => x.key === mode)?.hint,
            style: {
              display: "flex",
              gap: 4,
              padding: "6px 10px",
              borderBottom: "1px solid #1f2937",
              background: "#0d1320"
            },
            children: MODES.map((x) => {
              const active = mode === x.key;
              return /* @__PURE__ */ jsxs(
                "button",
                {
                  onClick: () => setMode(x.key),
                  title: x.hint,
                  style: {
                    flex: 1,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 5,
                    padding: "5px 8px",
                    borderRadius: 7,
                    border: "1px solid " + (active ? "#2563eb" : "#283246"),
                    background: active ? "#1d4ed8" : "transparent",
                    color: active ? "#fff" : "#9ca3af",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: active ? 600 : 500,
                    transition: "background 120ms, border-color 120ms"
                  },
                  children: [
                    /* @__PURE__ */ jsx("span", { "aria-hidden": true, children: x.icon }),
                    x.label
                  ]
                },
                x.key
              );
            })
          }
        ),
        locked ? (
          /* Ecrã de bloqueio — pedir código de acesso */
          /* @__PURE__ */ jsxs("div", { style: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24 }, children: [
            /* @__PURE__ */ jsx("span", { style: { fontSize: 32 }, children: "\u{1F512}" }),
            /* @__PURE__ */ jsxs("p", { style: { color: "#9ca3af", textAlign: "center", margin: 0, fontSize: 13, maxWidth: 280 }, children: [
              "Este canal requer um c\xF3digo de acesso.",
              /* @__PURE__ */ jsx("br", {}),
              "Obt\xE9m o link de liga\xE7\xE3o no dashboard e abre-o neste browser, ou introduz o c\xF3digo manualmente."
            ] }),
            /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 8, width: "100%", maxWidth: 320 }, children: [
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "password",
                  value: codeInput,
                  onChange: (e) => setCodeInput(e.target.value),
                  onKeyDown: (e) => {
                    if (e.key === "Enter" && codeInput.trim()) {
                      unlock(codeInput.trim());
                      setCodeInput("");
                    }
                  },
                  placeholder: "C\xF3digo de acesso\u2026",
                  autoFocus: true,
                  style: {
                    flex: 1,
                    background: "#111827",
                    color: "#e5e7eb",
                    border: "1px solid #374151",
                    borderRadius: 8,
                    padding: "8px 10px",
                    fontFamily: "inherit",
                    fontSize: 14,
                    outline: "none"
                  }
                }
              ),
              /* @__PURE__ */ jsx(
                "button",
                {
                  onClick: () => {
                    if (codeInput.trim()) {
                      unlock(codeInput.trim());
                      setCodeInput("");
                    }
                  },
                  disabled: !codeInput.trim(),
                  style: {
                    background: codeInput.trim() ? "#2563eb" : "#374151",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    padding: "0 14px",
                    cursor: codeInput.trim() ? "pointer" : "default",
                    fontWeight: 600,
                    fontSize: 13
                  },
                  children: "OK"
                }
              )
            ] })
          ] })
        ) : /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsxs("div", { ref: listRef, style: { flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10 }, children: [
            messages.length === 0 && /* @__PURE__ */ jsx("p", { style: { color: "#6b7280", textAlign: "center", marginTop: 24 }, children: online ? "Liga-te ao Claude Code da tua m\xE1quina. Escreve abaixo." : "\xC0 espera do terminal\u2026" }),
            messages.map((m) => /* @__PURE__ */ jsxs(
              "div",
              {
                style: {
                  alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: "85%",
                  padding: "8px 12px",
                  borderRadius: 12,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  background: m.role === "user" ? "#2563eb" : "#1f2937",
                  color: m.role === "user" ? "#fff" : "#e5e7eb"
                },
                children: [
                  m.tools && m.tools.length > 0 && /* @__PURE__ */ jsx("div", { style: { marginBottom: m.content ? 6 : 0, display: "flex", flexDirection: "column", gap: 2 }, children: m.tools.map((t, i) => /* @__PURE__ */ jsxs("span", { style: { color: "#9ca3af", fontSize: 12, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }, children: [
                    "\u25B8 ",
                    t
                  ] }, i)) }),
                  m.content,
                  m.streaming && /* @__PURE__ */ jsx("span", { style: { opacity: 0.6 }, className: "tb-caret", children: "\u258B" })
                ]
              },
              m.id
            )),
            isStreaming && !messages.some((m) => m.streaming) && /* @__PURE__ */ jsx("div", { style: { alignSelf: "flex-start", color: "#9ca3af", fontStyle: "italic" }, children: "a pensar\u2026" })
          ] }),
          /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 8, padding: 10, borderTop: "1px solid #1f2937" }, children: [
            /* @__PURE__ */ jsx(
              "textarea",
              {
                value: input,
                onChange: (e) => setInput(e.target.value),
                onKeyDown: (e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                },
                placeholder: mode === "terminal" ? "Comando de shell\u2026 (ex. git status)" : placeholder,
                rows: 1,
                style: {
                  flex: 1,
                  resize: "none",
                  background: "#111827",
                  color: "#e5e7eb",
                  border: "1px solid #374151",
                  borderRadius: 8,
                  padding: "8px 10px",
                  fontFamily: "inherit",
                  fontSize: 14,
                  outline: "none"
                }
              }
            ),
            /* @__PURE__ */ jsx(
              "button",
              {
                onClick: submit,
                disabled: isStreaming || !input.trim(),
                style: {
                  background: isStreaming || !input.trim() ? "#374151" : "#2563eb",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  padding: "0 16px",
                  cursor: isStreaming || !input.trim() ? "default" : "pointer",
                  fontWeight: 600
                },
                children: "\u27A4"
              }
            )
          ] })
        ] })
      ]
    }
  );
}

// src/Launcher.tsx
import { useEffect as useEffect4, useRef as useRef4, useState as useState4 } from "react";

// src/AudioNotes.tsx
import { useCallback as useCallback2, useEffect as useEffect3, useRef as useRef3, useState as useState3 } from "react";
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var DASHBOARD_API = "https://ioc-1.tail215de3.ts.net:4748";
var READ_KEY = "tb-audio-read";
function prettyFrom(m) {
  if (m.pushName) return m.pushName;
  const jid = String(m.participant || m.from || "");
  const [user, server] = jid.split("@");
  if (!user) return "Desconhecido";
  if (server === "g.us") return "Grupo";
  if (server === "lid") return `Contacto \xB7${user.slice(-4)}`;
  const d = user.replace(/[^0-9]/g, "");
  if (d.length >= 11) return `+${d.slice(0, d.length - 9)} ${d.slice(-9, -6)} ${d.slice(-6, -3)} ${d.slice(-3)}`;
  return d ? `+${d}` : jid;
}
function prettyTime(ts) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  const now = /* @__PURE__ */ new Date();
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (d.toDateString() === now.toDateString()) return hm;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${hm}`;
}
var resolvedBase = null;
async function fetchVoiceNotes(apiBase, limit = 200) {
  const bases = apiBase != null ? [apiBase] : resolvedBase != null ? [resolvedBase] : ["", DASHBOARD_API];
  let lastErr = null;
  for (const base of bases) {
    try {
      const r = await fetch(`${base}/api/whatsapp/messages?limit=${limit}`, { credentials: "omit" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const body = await r.json();
      const msgs = Array.isArray(body?.messages) ? body.messages : [];
      if (!Array.isArray(body?.messages)) throw new Error("resposta sem messages[]");
      resolvedBase = base;
      const seen = /* @__PURE__ */ new Set();
      const out = [];
      for (const m of msgs) {
        const t = typeof m.transcript === "string" ? m.transcript.trim() : "";
        if (m.dir !== "in" || !t) continue;
        if (!m.is_voice && m.raw_type !== "audioMessage") continue;
        const id = m.id || `${m.ts}-${m.from}`;
        if (seen.has(id)) continue;
        seen.add(id);
        out.push({ id, ts: m.ts || "", who: prettyFrom(m), text: t });
      }
      out.sort((a, b) => a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0);
      return out;
    } catch (e) {
      lastErr = e;
    }
  }
  resolvedBase = null;
  throw lastErr instanceof Error ? lastErr : new Error("falhou");
}
function useVoiceNotes(enabled, active, open, apiBase) {
  const [notes, setNotes] = useState3([]);
  const [error, setError] = useState3(null);
  const [loading, setLoading] = useState3(true);
  const [lastRead, setLastRead] = useState3(() => {
    try {
      return localStorage.getItem(READ_KEY) || "";
    } catch {
      return "";
    }
  });
  const load = useCallback2(() => {
    fetchVoiceNotes(apiBase).then((n) => {
      setNotes(n);
      setError(null);
    }).catch((e) => setError(e?.message || "sem liga\xE7\xE3o ao dashboard")).finally(() => setLoading(false));
  }, [apiBase]);
  const loadRef = useRef3(load);
  loadRef.current = load;
  useEffect3(() => {
    if (!enabled) return;
    const period = active ? 25e3 : open ? 6e4 : 3e5;
    loadRef.current();
    const t = setInterval(() => loadRef.current(), period);
    return () => clearInterval(t);
  }, [enabled, active, open]);
  useEffect3(() => {
    if (!active || !notes.length) return;
    const newest = notes[0].ts;
    if (newest && newest > lastRead) {
      try {
        localStorage.setItem(READ_KEY, newest);
      } catch {
      }
      setLastRead(newest);
    }
  }, [active, notes, lastRead]);
  const unread = lastRead ? notes.filter((n) => n.ts > lastRead).length : notes.length;
  return { notes, error, loading, unread, reload: load };
}
function AudioNotesPanel({
  notes,
  error,
  loading,
  onReload
}) {
  return /* @__PURE__ */ jsxs2("div", { style: { height: "100%", overflowY: "auto", background: "#0f1117", padding: 10 }, children: [
    loading && !notes.length && /* @__PURE__ */ jsx2("div", { style: { color: "#64748b", fontSize: 12, padding: 16, textAlign: "center" }, children: "a carregar\u2026" }),
    error && !notes.length && /* @__PURE__ */ jsxs2("div", { style: { color: "#f59e0b", fontSize: 12, padding: 16, textAlign: "center", lineHeight: 1.6 }, children: [
      "N\xE3o consegui ler as transcri\xE7\xF5es (",
      error,
      ").",
      /* @__PURE__ */ jsx2("br", {}),
      /* @__PURE__ */ jsx2(
        "button",
        {
          onClick: onReload,
          style: { marginTop: 10, background: "rgba(255,255,255,0.08)", border: "none", color: "#e2e8f0", borderRadius: 6, padding: "5px 12px", fontSize: 12, cursor: "pointer" },
          children: "Tentar de novo"
        }
      )
    ] }),
    !loading && !error && !notes.length && /* @__PURE__ */ jsxs2("div", { style: { color: "#64748b", fontSize: 12, padding: 16, textAlign: "center", lineHeight: 1.6 }, children: [
      "Ainda n\xE3o h\xE1 voice notes transcritas.",
      /* @__PURE__ */ jsx2("br", {}),
      /* @__PURE__ */ jsx2("span", { style: { fontSize: 11 }, children: "Envia um \xE1udio para 912814143 ou 937857366." })
    ] }),
    notes.map((n) => /* @__PURE__ */ jsxs2(
      "div",
      {
        style: {
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 10,
          padding: "9px 11px",
          marginBottom: 8
        },
        children: [
          /* @__PURE__ */ jsxs2("div", { style: { display: "flex", alignItems: "baseline", gap: 8, marginBottom: 5 }, children: [
            /* @__PURE__ */ jsx2("span", { style: { fontSize: 12, fontWeight: 600, color: "#93c5fd", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: n.who }),
            /* @__PURE__ */ jsx2("span", { style: { marginLeft: "auto", fontSize: 10, color: "#64748b", flexShrink: 0 }, children: prettyTime(n.ts) })
          ] }),
          /* @__PURE__ */ jsx2("div", { style: { fontSize: 12.5, color: "#e2e8f0", lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }, children: n.text })
        ]
      },
      n.id
    ))
  ] });
}

// src/Launcher.tsx
import { Fragment as Fragment2, jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function sanitizePagePath(raw) {
  try {
    const u = new URL(raw, window.location.origin);
    for (const k of [...u.searchParams.keys()]) {
      if (/^(claude|token|access_token|refresh_token|apikey|api_key|key|secret|jwt|code|state)$/i.test(k)) u.searchParams.delete(k);
    }
    const qs = u.searchParams.toString();
    return u.pathname + (qs ? "?" + qs : "");
  } catch {
    return raw.split("#")[0].split("?")[0];
  }
}
function IframeMacLauncher({
  channel,
  site,
  variant = "embed",
  title = "Consola dev",
  brand = "#2563eb",
  gate = "claude",
  audio = true,
  api
}) {
  const [enabled, setEnabled] = useState4(gate === "always");
  const [open, setOpen] = useState4(false);
  const [expanded, setExpanded] = useState4(false);
  const [tab, setTab] = useState4("chat");
  const iframeRef = useRef4(null);
  const siteName = site || channel.replace(/^bridge-/, "");
  const audioOn = audio && enabled;
  const { notes, error: audioError, loading: audioLoading, unread, reload: reloadAudio } = useVoiceNotes(audioOn, open && tab === "audio", open, api);
  const badge = audioOn ? unread : 0;
  useEffect4(() => {
    if (variant !== "embed" || !open) return;
    const iframe = iframeRef.current;
    if (!iframe) return;
    let last = "";
    const send = (force) => {
      try {
        const path = sanitizePagePath(window.location.pathname + window.location.search);
        const key = path + "\0" + document.title;
        if (!force && key === last) return;
        last = key;
        iframe.contentWindow?.postMessage(
          { type: "page", path, title: document.title, site: siteName },
          window.location.origin
        );
      } catch {
      }
    };
    const onNav = () => send();
    const onLoad = () => send(true);
    send(true);
    iframe.addEventListener("load", onLoad);
    const origPush = history.pushState;
    const origReplace = history.replaceState;
    history.pushState = function(...a) {
      origPush.apply(this, a);
      onNav();
    };
    history.replaceState = function(...a) {
      origReplace.apply(this, a);
      onNav();
    };
    window.addEventListener("popstate", onNav);
    window.addEventListener("hashchange", onNav);
    const timer = setInterval(onNav, 2e3);
    return () => {
      iframe.removeEventListener("load", onLoad);
      history.pushState = origPush;
      history.replaceState = origReplace;
      window.removeEventListener("popstate", onNav);
      window.removeEventListener("hashchange", onNav);
      clearInterval(timer);
    };
  }, [variant, open, siteName]);
  useEffect4(() => {
    if (gate === "always") return;
    const qs = new URLSearchParams(window.location.search);
    const param = qs.get("claude");
    if (param === "1") localStorage.setItem("tb-enabled", "1");
    if (param === "0") localStorage.removeItem("tb-enabled");
    setEnabled(localStorage.getItem("tb-enabled") === "1");
    const onOpen = () => {
      localStorage.setItem("tb-enabled", "1");
      setEnabled(true);
      setOpen(true);
    };
    window.addEventListener("tb-open", onOpen);
    return () => window.removeEventListener("tb-open", onOpen);
  }, [gate]);
  if (!enabled) return null;
  const popupStyle = expanded ? {
    position: "fixed",
    top: 12,
    left: 12,
    right: 12,
    bottom: 12,
    zIndex: 2147483645,
    borderRadius: 16,
    overflow: "hidden",
    background: "#0f1117",
    boxShadow: "0 24px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.1)",
    display: "flex",
    flexDirection: "column"
  } : {
    position: "fixed",
    bottom: 84,
    right: 20,
    zIndex: 2147483645,
    width: "min(420px, calc(100vw - 40px))",
    height: "min(600px, calc(100vh - 120px))",
    borderRadius: 16,
    overflow: "hidden",
    background: "#0f1117",
    boxShadow: "0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.08)",
    display: "flex",
    flexDirection: "column"
  };
  const tabStyle = (on) => ({
    flex: 1,
    background: on ? "rgba(37,99,235,0.18)" : "transparent",
    border: "none",
    borderBottom: on ? "2px solid #3b82f6" : "2px solid transparent",
    color: on ? "#e2e8f0" : "#64748b",
    fontSize: 11.5,
    fontWeight: 600,
    cursor: "pointer",
    padding: "7px 4px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 5
  });
  return /* @__PURE__ */ jsxs3(Fragment2, { children: [
    /* @__PURE__ */ jsxs3("div", { style: { position: "fixed", bottom: 20, right: 20, zIndex: 2147483646 }, children: [
      /* @__PURE__ */ jsx3(
        "button",
        {
          type: "button",
          onClick: () => setOpen((o) => !o),
          title,
          style: {
            width: 52,
            height: 52,
            borderRadius: 9999,
            border: "none",
            cursor: "pointer",
            background: brand,
            color: "#fff",
            fontSize: 22,
            boxShadow: open ? "0 0 0 4px rgba(37,99,235,0.3), 0 8px 24px rgba(0,0,0,0.4)" : "0 4px 16px rgba(0,0,0,0.35)",
            transition: "all 0.15s ease",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          },
          children: open ? "\u2715" : "\u{1F916}"
        }
      ),
      !open && badge > 0 && /* @__PURE__ */ jsx3(
        "span",
        {
          "data-testid": "tb-audio-badge",
          title: `${badge} transcri\xE7\xE3o(\xF5es) por ler`,
          style: {
            position: "absolute",
            top: -3,
            right: -3,
            minWidth: 20,
            height: 20,
            padding: "0 5px",
            borderRadius: 9999,
            background: "#ef4444",
            color: "#fff",
            fontSize: 11,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "2px solid #0f1117",
            boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
            pointerEvents: "none"
          },
          children: badge > 99 ? "99+" : badge
        }
      )
    ] }),
    open && /* @__PURE__ */ jsxs3("div", { style: popupStyle, "data-iframe-mac-ignore": "true", children: [
      /* @__PURE__ */ jsxs3(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 12px",
            flexShrink: 0,
            borderBottom: "1px solid rgba(255,255,255,0.07)",
            background: "rgba(255,255,255,0.03)"
          },
          children: [
            /* @__PURE__ */ jsx3("span", { style: { fontSize: 15 }, children: "\u{1F916}" }),
            /* @__PURE__ */ jsx3("div", { style: { flex: 1, fontSize: 12, fontWeight: 600, color: "#e2e8f0" }, children: title }),
            /* @__PURE__ */ jsx3(
              "button",
              {
                onClick: () => setExpanded((e) => !e),
                style: { background: "none", border: "none", color: "#64748b", fontSize: 14, cursor: "pointer", padding: "2px 5px" },
                title: expanded ? "Recolher" : "Expandir",
                children: expanded ? "\u22A1" : "\u229E"
              }
            ),
            /* @__PURE__ */ jsx3(
              "button",
              {
                onClick: () => setOpen(false),
                style: { background: "none", border: "none", color: "#64748b", fontSize: 16, cursor: "pointer", padding: "2px 4px" },
                title: "Fechar",
                children: "\u2715"
              }
            )
          ]
        }
      ),
      audioOn && /* @__PURE__ */ jsxs3("div", { style: { display: "flex", flexShrink: 0, borderBottom: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)" }, children: [
        /* @__PURE__ */ jsx3("button", { type: "button", onClick: () => setTab("chat"), style: tabStyle(tab === "chat"), children: "\u{1F4AC} Chat" }),
        /* @__PURE__ */ jsxs3("button", { type: "button", onClick: () => setTab("audio"), style: tabStyle(tab === "audio"), children: [
          "\u{1F399}\uFE0F \xC1udios",
          badge > 0 && /* @__PURE__ */ jsx3("span", { style: { background: "#ef4444", color: "#fff", borderRadius: 9999, fontSize: 9.5, fontWeight: 700, padding: "1px 5px", lineHeight: 1.4 }, children: badge > 99 ? "99+" : badge })
        ] })
      ] }),
      /* @__PURE__ */ jsx3("div", { style: { flex: 1, minHeight: 0, display: tab === "chat" ? "block" : "none" }, children: variant === "embed" ? /* @__PURE__ */ jsx3(
        "iframe",
        {
          ref: iframeRef,
          src: `/embed.html?site=${encodeURIComponent(siteName)}`,
          title,
          allow: "clipboard-write",
          style: { width: "100%", height: "100%", border: 0, display: "block", background: "#0f1117" }
        }
      ) : /* @__PURE__ */ jsx3(IframeMacChat, { channel }) }),
      audioOn && tab === "audio" && /* @__PURE__ */ jsx3("div", { style: { flex: 1, minHeight: 0 }, "data-testid": "tb-audio-panel", children: /* @__PURE__ */ jsx3(AudioNotesPanel, { notes, error: audioError, loading: audioLoading, onReload: reloadAudio }) })
    ] })
  ] });
}
export {
  IframeMacChat,
  IframeMacLauncher,
  useIframeMac
};
//# sourceMappingURL=index.js.map