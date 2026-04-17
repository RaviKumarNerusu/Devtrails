import React, { useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { askIncomeGuardAI } from "../services/chatbotService";

function makeMessage(role, text) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    text
  };
}

export default function IncomeGuardAIChatbot() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [messages, setMessages] = useState(() => [
    makeMessage("bot", "Hi! I'm Income Guard AI. How can I help protect your earnings?")
  ]);

  const hideWidget = useMemo(() => location.pathname.startsWith("/admin"), [location.pathname]);

  if (hideWidget) {
    return null;
  }

  const toggleChat = () => {
    setOpen((prev) => !prev);
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isSending) return;

    const userMsg = makeMessage("user", text);
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsSending(true);

    try {
      const reply = await askIncomeGuardAI(text);
      setMessages((prev) => [...prev, makeMessage("bot", reply)]);
    } catch (error) {
      setMessages((prev) => [...prev, makeMessage("bot", "Service unavailable right now. Please try again shortly.")]);
    } finally {
      setIsSending(false);
    }
  };

  const onInputKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      <style>{`
        .gg-chat-launcher {
          position: fixed;
          bottom: 20px;
          right: 20px;
          width: 60px;
          height: 60px;
          border: 0;
          border-radius: 50%;
          cursor: pointer;
          z-index: 1200;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-size: 30px;
          box-shadow: 0 14px 30px rgba(12, 18, 34, 0.25);
          background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%);
        }

        .gg-chat-window {
          position: fixed;
          bottom: 92px;
          right: 20px;
          width: min(350px, calc(100vw - 24px));
          height: min(500px, calc(100vh - 120px));
          background: #ffffff;
          border-radius: 16px;
          box-shadow: 0 22px 50px rgba(12, 18, 34, 0.28);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          z-index: 1200;
          border: 1px solid #e5e7eb;
          animation: gg-chat-slide 180ms ease-out;
        }

        .gg-chat-header {
          background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%);
          color: #fff;
          padding: 14px 16px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .gg-chat-close {
          border: 0;
          background: transparent;
          color: #fff;
          font-size: 22px;
          line-height: 1;
          cursor: pointer;
        }

        .gg-chat-messages {
          flex: 1;
          padding: 14px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 10px;
          background: linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%);
        }

        .gg-chat-msg {
          padding: 10px 12px;
          border-radius: 12px;
          font-size: 14px;
          line-height: 1.4;
          max-width: 82%;
          word-break: break-word;
        }

        .gg-chat-msg-user {
          align-self: flex-end;
          background: #0f766e;
          color: #fff;
          border-bottom-right-radius: 4px;
        }

        .gg-chat-msg-bot {
          align-self: flex-start;
          background: #fff;
          color: #111827;
          border-bottom-left-radius: 4px;
          box-shadow: 0 4px 10px rgba(15, 23, 42, 0.06);
        }

        .gg-chat-input-area {
          padding: 12px;
          display: flex;
          gap: 8px;
          border-top: 1px solid #e5e7eb;
          background: #fff;
        }

        #gg-chat-input {
          flex: 1;
          min-width: 0;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          padding: 10px;
          font-size: 14px;
          outline: none;
        }

        #gg-chat-input:focus {
          border-color: #0f766e;
          box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.15);
        }

        .gg-chat-send {
          border: 0;
          border-radius: 8px;
          padding: 0 14px;
          font-weight: 700;
          color: #fff;
          cursor: pointer;
          background: #0f766e;
        }

        .gg-chat-send:disabled {
          cursor: not-allowed;
          opacity: 0.7;
        }

        @keyframes gg-chat-slide {
          from {
            opacity: 0;
            transform: translateY(12px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @media (max-width: 640px) {
          .gg-chat-window {
            right: 12px;
            bottom: 84px;
          }

          .gg-chat-launcher {
            right: 12px;
            bottom: 14px;
          }
        }
      `}</style>

      <button type="button" className="gg-chat-launcher" onClick={toggleChat} aria-label="Open support chatbot">
        <span aria-hidden="true">🤖</span>
      </button>

      {open ? (
        <section className="gg-chat-window" aria-label="Income Guard AI chatbot">
          <header className="gg-chat-header">
            <span>Income Guard AI</span>
            <button type="button" className="gg-chat-close" onClick={toggleChat} aria-label="Close chatbot">
              ×
            </button>
          </header>

          <div className="gg-chat-messages">
            {messages.map((msg) => (
              <div key={msg.id} className={`gg-chat-msg ${msg.role === "user" ? "gg-chat-msg-user" : "gg-chat-msg-bot"}`}>
                {msg.text}
              </div>
            ))}
            {isSending ? <div className="gg-chat-msg gg-chat-msg-bot">Typing...</div> : null}
          </div>

          <div className="gg-chat-input-area">
            <input
              id="gg-chat-input"
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder="Ask about rain cover..."
              disabled={isSending}
            />
            <button type="button" className="gg-chat-send" onClick={sendMessage} disabled={isSending}>
              Send
            </button>
          </div>
        </section>
      ) : null}
    </>
  );
}
