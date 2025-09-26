import express from "express";
import { ObjectId } from "mongodb";
import dotenv from "dotenv";
import OpenAI from "openai";

const router = express.Router();

// AI client
const openai = new OpenAI({
  baseURL: "https://router.huggingface.co/v1",
  apiKey: "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",
});

// Simple knowledge base (fallbacks)
const knowledgeBase = {
  math: "Focus on NCERT and RD Sharma. Practice daily problems and revise formulas regularly.",
  science: "NCERT diagrams are crucial. Conduct small experiments and understand concepts practically.",
  english: "Daily reading improves vocabulary. Practice writing essays and grammar exercises.",
  general: "Maintain consistent study schedule. Take breaks every 45 minutes for better retention.",
};

// Rate limit store
const rateLimit = new Map();
function checkRateLimit(studentId) {
  const now = Date.now();
  const windowStart = now - 60000;
  if (!rateLimit.has(studentId)) rateLimit.set(studentId, []);
  const requests = rateLimit.get(studentId).filter((t) => t > windowStart);
  rateLimit.set(studentId, requests);
  if (requests.length >= 10) return false;
  requests.push(now);
  return true;
}

export default function setupChatRoutes(app, db) {
  // Chat endpoint
  app.post("/api/chat", async (req, res) => {
    try {
      const { text, messageId, studentId } = req.body;

      if (!text) {
        return res.status(400).json({ error: "Message text is required", success: false });
      }

      // Use given studentId or fallback to "guest"
      const sid = studentId || "guest";

      if (!checkRateLimit(sid)) {
        return res.status(429).json({ error: "Too many requests. Try again later.", success: false });
      }

      // Save user message
      const userMessage = {
        studentId: sid,
        messageId: messageId || new ObjectId().toString(),
        role: "user",
        content: text,
        timestamp: new Date(),
      };
      await db.collection("chat_history").insertOne(userMessage);

      // AI response
      const completion = await openai.chat.completions.create({
        model: "Qwen/Qwen3-Next-80B-A3B-Instruct:novita",
        messages: [
          { role: "system", content: "You are a friendly educational mentor." },
          { role: "user", content: text },
        ],
        max_tokens: 500,
        temperature: 0.7,
      });

      const aiResponse = completion.choices[0].message.content;

      const botMessage = {
        studentId: sid,
        messageId: new ObjectId().toString(),
        role: "assistant",
        content: aiResponse,
        timestamp: new Date(),
      };
      await db.collection("chat_history").insertOne(botMessage);

      res.json({ reply: aiResponse, success: true });
    } catch (err) {
      console.error("Chat error:", err);
      res.status(500).json({ error: "Chat service failed", success: false });
    }
  });

  // Chat history endpoint
  app.get("/api/chat/history/:studentId?", async (req, res) => {
    try {
      const sid = req.params.studentId || "guest";

      const history = await db
        .collection("chat_history")
        .find({ studentId: sid })
        .sort({ timestamp: 1 })
        .limit(50)
        .toArray();

      res.json({ history, success: true });
    } catch (err) {
      console.error("History error:", err);
      res.status(500).json({ error: "History fetch failed", success: false });
    }
  });
}