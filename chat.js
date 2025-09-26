import express from "express";
import { ObjectId } from "mongodb";
import OpenAI from "openai";

const router = express.Router();

// AI client
const openai = new OpenAI({
  baseURL: "https://router.huggingface.co/v1",
  apiKey: "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"
});

// Simple knowledge base
const knowledgeBase = {
  math: "Focus on NCERT and RD Sharma. Practice daily problems and revise formulas regularly.",
  science: "NCERT diagrams are crucial. Conduct small experiments and understand concepts practically.",
  english: "Daily reading improves vocabulary. Practice writing essays and grammar exercises.",
  general: "Maintain consistent study schedule. Take breaks every 45 minutes for better retention."
};

// Rate limit store
const rateLimit = new Map();
function checkRateLimit(studentId) {
  const now = Date.now();
  const windowStart = now - 60000;
  if (!rateLimit.has(studentId)) rateLimit.set(studentId, []);
  const requests = rateLimit.get(studentId).filter(t => t > windowStart);
  rateLimit.set(studentId, requests);
  if (requests.length >= 10) return false;
  requests.push(now);
  return true;
}

export default function setupChatRoutes(app, db, authenticateToken) {
  // Chat endpoint
  app.post("/api/chat", authenticateToken, async (req, res) => {
    try {
      const { text, messageId } = req.body;
      const studentId = req.user.userType === "student" ? req.user.userId : req.body.studentId;

      if (!text) {
        return res.status(400).json({ error: "Message text is required", success: false });
      }
      if (req.user.userType === "parent" && !studentId) {
        return res.status(400).json({ error: "Student ID required for parent accounts", success: false });
      }

      if (!checkRateLimit(studentId || req.user.userId)) {
        return res.status(429).json({ error: "Too many requests. Try again later.", success: false });
      }

      const student = await db.collection("users").findOne({ _id: new ObjectId(studentId || req.user.userId) });
      if (!student) {
        return res.status(404).json({ error: "Student not found", success: false });
      }

      // Save user message
      const userMessage = {
        studentId: student._id,
        messageId: messageId || new ObjectId().toString(),
        role: "user",
        content: text,
        timestamp: new Date(),
        userType: req.user.userType,
      };
      await db.collection("chat_history").insertOne(userMessage);

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
        studentId: student._id,
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

  // Chat history
  app.get("/api/chat/history/:studentId?", authenticateToken, async (req, res) => {
    try {
      let studentId = req.params.studentId;
      if (req.user.userType === "student") studentId = req.user.userId;
      if (!studentId) {
        return res.status(400).json({ error: "Student ID required", success: false });
      }

      const history = await db.collection("chat_history")
        .find({ studentId: new ObjectId(studentId) })
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