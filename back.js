import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { MongoClient, ObjectId } from "mongodb";
import OpenAI from "openai";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import path from "path";
import { fileURLToPath } from 'url';
import setupChatRoutes from "./chat.js";

// Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();

// Middleware - IMPORTANT: Order matters!
app.use(cors());
app.use(bodyParser.json());

// Serve static files FIRST - this is crucial
app.use(express.static(__dirname));

// Then define your API routes
// MongoDB connection
const client = new MongoClient(process.env.MONGO_URI || "mongodb://localhost:27017");
let db;

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";

async function connectDB() {
  try {
    await client.connect();
    db = client.db(process.env.DB_NAME || "SihPrac1");
    console.log("✅ Connected to MongoDB");
    
    // Create sample data if collection is empty
    await initializeSampleData();
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    process.exit(1);
  }
}

const PORT = process.env.PORT || 3000;
// after db connected
connectDB().then(() => {
  // Register AI Chat routes
  setupChatRoutes(app, db, authenticateToken);
 

  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
});

async function initializeSampleData() {
  const usersCollection = db.collection("users");
  const count = await usersCollection.countDocuments();
  
  if (count === 0) {
    // Create sample student
    const hashedPassword = await bcrypt.hash("student123", 10);
    await usersCollection.insertOne({
      email: "student@educonnect.com",
      password: hashedPassword,
      name: "Rahul Student",
      userType: "student",
      studentId: "S123",
      studentClass: 10,
      avatar: "RS",
      performance: {
        math: 85,
        science: 78,
        english: 92
      },
      attendance: 95,
      remarks: "Excellent student, needs improvement in science",
      rewardPoints: 1250,
      createdAt: new Date()
    });

    // Create sample parent
    const parentHashedPassword = await bcrypt.hash("parent123", 10);
    await usersCollection.insertOne({
      email: "parent@educonnect.com",
      password: parentHashedPassword,
      name: "Parent User",
      userType: "parent",
      children: ["S123"],
      createdAt: new Date()
    });

    console.log("📊 Sample user data created");
  }
}

// Explicit routes for HTML files - ADD THESE
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/frontend.html", (req, res) => {
    res.sendFile(path.join(__dirname, "frontend.html"));
});

// Authentication Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: "Access token required", success: false });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: "Invalid or expired token", success: false });
    }
    req.user = user;
    next();
  });
};

// // OpenAI setup
// const openai = new OpenAI({ 
//   baseURL: "https://router.huggingface.co/v1",
//   apiKey: process.env.HF_TOKEN
// });

// // Enhanced knowledge base
// const knowledgeBase = {
//   math: "Focus on NCERT and RD Sharma. Practice daily problems and revise formulas regularly.",
//   science: "NCERT diagrams are crucial. Conduct small experiments and understand concepts practically.",
//   english: "Daily reading improves vocabulary. Practice writing essays and grammar exercises.",
//   general: "Maintain consistent study schedule. Take breaks every 45 minutes for better retention."
// };

// // Rate limiting
// const rateLimit = new Map();

// function checkRateLimit(studentId) {
//   const now = Date.now();
//   const windowStart = now - 60000; // 1 minute window
  
//   if (!rateLimit.has(studentId)) {
//     rateLimit.set(studentId, []);
//   }
  
//   const requests = rateLimit.get(studentId).filter(time => time > windowStart);
//   rateLimit.set(studentId, requests);
  
//   if (requests.length >= 10) { // 10 requests per minute
//     return false;
//   }
  
//   requests.push(now);
//   return true;
// }

// Authentication Routes
app.post("/api/register", async (req, res) => {
  try {
    const { email, password, name, userType, studentId, studentClass } = req.body;

    if (!email || !password || !name || !userType) {
      return res.status(400).json({ 
        error: "Email, password, name, and user type are required",
        success: false
      });
    }

    // Check if user already exists
    const existingUser = await db.collection("users").findOne({ email });
    if (existingUser) {
      return res.status(400).json({ 
        error: "User already exists with this email",
        success: false
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user object
    const user = {
      email,
      password: hashedPassword,
      name,
      userType,
      studentId: userType === 'student' ? studentId || `S${Math.random().toString(36).substr(2, 9)}` : null,
      studentClass: userType === 'student' ? studentClass || 10 : null,
      avatar: name.split(' ').map(n => n[0]).join('').toUpperCase(),
      createdAt: new Date()
    };

    // Add additional fields based on user type
    if (userType === 'student') {
      user.performance = { math: 0, science: 0, english: 0 };
      user.attendance = 0;
      user.rewardPoints = 0;
      user.remarks = "New student";
    } else if (userType === 'parent') {
      user.children = [];
    }

    // Insert user
    const result = await db.collection("users").insertOne(user);

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: result.insertedId, 
        email: user.email, 
        userType: user.userType,
        name: user.name 
      }, 
      JWT_SECRET, 
      { expiresIn: '24h' }
    );

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      token,
      user: {
        id: result.insertedId,
        email: user.email,
        name: user.name,
        userType: user.userType,
        avatar: user.avatar,
        studentClass: user.studentClass
      }
    });

  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "Internal server error", success: false });
  }
});

// Add to back.js after the existing endpoints

// Vocational Course Registration
app.post("/api/vocational/register", authenticateToken, async (req, res) => {
  try {
    const { courseId, courseName } = req.body;
    
    if (!courseId || !courseName) {
      return res.status(400).json({ 
        error: "Course ID and name are required",
        success: false
      });
    }

    // Check if user is a student
    if (req.user.userType !== 'student') {
      return res.status(403).json({ 
        error: "Only students can register for vocational courses",
        success: false
      });
    }

    // Update user's vocational courses
    const result = await db.collection("users").updateOne(
      { _id: new ObjectId(req.user.userId) },
      { 
        $addToSet: { 
          vocationalCourses: {
            courseId,
            courseName,
            registeredAt: new Date(),
            progress: 0,
            completed: false,
            lastAccessed: new Date()
          }
        }
      }
    );

    if (result.modifiedCount === 0) {
      return res.status(400).json({ 
        error: "Failed to register for course",
        success: false
      });
    }

    res.json({
      success: true,
      message: `Successfully registered for ${courseName}`
    });

  } catch (error) {
    console.error("Course registration error:", error);
    res.status(500).json({ error: "Internal server error", success: false });
  }
});

// Get Student's Vocational Courses
app.get("/api/vocational/courses", authenticateToken, async (req, res) => {
  try {
    if (req.user.userType !== 'student') {
      return res.status(403).json({ 
        error: "Only students can access vocational courses",
        success: false
      });
    }

    const user = await db.collection("users").findOne(
      { _id: new ObjectId(req.user.userId) },
      { projection: { vocationalCourses: 1 } }
    );

    res.json({
      success: true,
      courses: user.vocationalCourses || []
    });

  } catch (error) {
    console.error("Courses fetch error:", error);
    res.status(500).json({ error: "Failed to fetch courses", success: false });
  }
});

// Update Course Progress
app.put("/api/vocational/progress", authenticateToken, async (req, res) => {
  try {
    const { courseId, progress } = req.body;
    
    if (!courseId || progress === undefined) {
      return res.status(400).json({ 
        error: "Course ID and progress are required",
        success: false
      });
    }

    const result = await db.collection("users").updateOne(
      { 
        _id: new ObjectId(req.user.userId),
        "vocationalCourses.courseId": courseId
      },
      { 
        $set: { 
          "vocationalCourses.$.progress": progress,
          "vocationalCourses.$.lastAccessed": new Date()
        }
      }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ 
        error: "Course not found",
        success: false
      });
    }

    res.json({
      success: true,
      message: "Progress updated successfully"
    });

  } catch (error) {
    console.error("Progress update error:", error);
    res.status(500).json({ error: "Failed to update progress", success: false });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password, userType } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        error: "Email and password are required",
        success: false
      });
    }

    // Find user
    const user = await db.collection("users").findOne({ email });
    if (!user) {
      return res.status(401).json({ 
        error: "Invalid email or password",
        success: false
      });
    }

    // Check user type
    if (userType && user.userType !== userType) {
      return res.status(401).json({ 
        error: `Account is not a ${userType} account`,
        success: false
      });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ 
        error: "Invalid email or password",
        success: false
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user._id, 
        email: user.email, 
        userType: user.userType,
        name: user.name 
      }, 
      JWT_SECRET, 
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        userType: user.userType,
        avatar: user.avatar,
        studentId: user.studentId,
        studentClass: user.studentClass,
        performance: user.performance,
        rewardPoints: user.rewardPoints
      }
    });

  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal server error", success: false });
  }
});

// Protected route example - get user profile
app.get("/api/profile", authenticateToken, async (req, res) => {
  try {
    const user = await db.collection("users").findOne({ email: req.user.email });
    
    if (!user) {
      return res.status(404).json({ error: "User not found", success: false });
    }

    // Remove password from response
    const { password, ...userWithoutPassword } = user;

    res.json({
      success: true,
      user: userWithoutPassword
    });

  } catch (error) {
    console.error("Profile fetch error:", error);
    res.status(500).json({ error: "Internal server error", success: false });
  }
});

// Update user profile endpoint (including class)
app.put("/api/profile", authenticateToken, async (req, res) => {
  try {
    const { name, studentClass } = req.body;
    
    const updateData = {};
    if (name) updateData.name = name;
    if (studentClass !== undefined) updateData.studentClass = studentClass;
    
    const result = await db.collection("users").updateOne(
      { email: req.user.email },
      { $set: updateData }
    );
    
    if (result.modifiedCount === 0) {
      return res.status(404).json({ error: "User not found or no changes made", success: false });
    }
    
    // Get updated user
    const updatedUser = await db.collection("users").findOne({ email: req.user.email });
    const { password, ...userWithoutPassword } = updatedUser;
    
    res.json({
      success: true,
      message: "Profile updated successfully",
      user: userWithoutPassword
    });
    
  } catch (error) {
    console.error("Profile update error:", error);
    res.status(500).json({ error: "Internal server error", success: false });
  }
});

// // Updated Chat endpoint with authentication
// app.post("/api/chat", authenticateToken, async (req, res) => {
//   try {
//     const { text, messageId } = req.body;
//     const studentId = req.user.userType === 'student' ? req.user.userId : req.body.studentId;
    
//     if (!text) {
//       return res.status(400).json({ 
//         error: "Message text is required",
//         success: false
//       });
//     }

//     if (req.user.userType === 'parent' && !studentId) {
//       return res.status(400).json({ 
//         error: "Student ID is required for parent accounts",
//         success: false
//       });
//     }

//     // Rate limiting
//     if (!checkRateLimit(studentId || req.user.userId)) {
//       return res.status(429).json({
//         error: "Too many requests. Please wait a moment.",
//         success: false
//       });
//     }

//     // Fetch student data for context
//     let student;
//     if (req.user.userType === 'student') {
//       student = await db.collection("users").findOne({ _id: new ObjectId(req.user.userId) });
//     } else {
//       student = await db.collection("users").findOne({ _id: new ObjectId(studentId) });
//     }

//     if (!student) {
//       return res.status(404).json({ 
//         error: "Student not found.",
//         success: false
//       });
//     }

//     // Update last active timestamp
//     await db.collection("users").updateOne(
//       { _id: student._id },
//       { $set: { lastActive: new Date() } }
//     );

//     // Save user message to database
//     const userMessage = {
//       studentId: student._id,
//       messageId: messageId || new ObjectId().toString(),
//       role: "user",
//       content: text,
//       timestamp: new Date(),
//       userType: req.user.userType
//     };
//     await db.collection("chat_history").insertOne(userMessage);

//     // Prepare context for AI
//     const studentContext = `
// Student Profile:
// - Name: ${student.name}
// - Class: ${student.studentClass || 'Not specified'}
// - Performance: Math ${student.performance?.math || 0}%, Science ${student.performance?.science || 0}%, English ${student.performance?.english || 0}%
// - Attendance: ${student.attendance || 0}%
// - Recent Remarks: ${student.remarks || "No remarks yet"}
// `;

//     // Get recent conversation history for context
//     const recentMessages = await db.collection("chat_history")
//       .find({ studentId: student._id })
//       .sort({ timestamp: -1 })
//       .limit(6)
//       .toArray();
    
//     const conversationHistory = recentMessages.reverse()
//       .map(msg => `${msg.role}: ${msg.content}`)
//       .join("\n");

//     // Generate AI response
//     const completion = await openai.chat.completions.create({
//       model: "Qwen/Qwen3-Next-80B-A3B-Instruct:novita",
//       messages: [
//         {
//           role: "system",
//           content: `You are a friendly, knowledgeable educational mentor. 
          
// Guidelines:
// 1. Be supportive, encouraging, and personalized
// 2. Reference the student's performance data when relevant
// 3. Provide practical, actionable advice
// 4. Keep responses concise but helpful
// 5. If unsure, ask clarifying questions

// Knowledge Base:
// ${JSON.stringify(knowledgeBase, null, 2)}

// Student Context:
// ${studentContext}

// Recent Conversation:
// ${conversationHistory}

// Always respond in a warm, mentor-like tone.`
//         },
//         { role: "user", content: text }
//       ],
//       max_tokens: 500,
//       temperature: 0.7
//     });

//     const aiResponse = completion.choices[0].message.content;
    
//     // Save AI response to database
//     const botMessage = {
//       studentId: student._id,
//       messageId: new ObjectId().toString(),
//       role: "assistant",
//       content: aiResponse,
//       timestamp: new Date()
//     };
//     await db.collection("chat_history").insertOne(botMessage);
    
//     res.json({
//       reply: aiResponse,
//       messageId: botMessage.messageId,
//       timestamp: botMessage.timestamp,
//       success: true
//     });

//   } catch (error) {
//     console.error("Chat error:", error);
    
//     // Fallback response
//     const fallbackResponses = [
//       "I'm having trouble connecting right now. Please try again in a moment.",
//       "It seems I'm experiencing some technical difficulties. Could you please rephrase your question?",
//       "I apologize, but I'm unable to process your request at the moment. Please try again shortly."
//     ];
    
//     res.status(500).json({
//       error: "Internal server error",
//       reply: fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)],
//       success: false
//     });
//   }
// });

// // Get chat history endpoint (protected)
// app.get("/api/chat/history/:studentId?", authenticateToken, async (req, res) => {
//   try {
//     let studentId = req.params.studentId;
    
//     // If parent, use provided studentId; if student, use their own ID
//     if (req.user.userType === 'student') {
//       studentId = req.user.userId;
//     } else if (!studentId) {
//       return res.status(400).json({ error: "Student ID required for parent accounts", success: false });
//     }

//     const { limit = 50 } = req.query;
    
//     const history = await db.collection("chat_history")
//       .find({ studentId: new ObjectId(studentId) })
//       .sort({ timestamp: 1 })
//       .limit(parseInt(limit))
//       .toArray();
    
//     res.json({ history, success: true });
//   } catch (error) {
//     console.error("History fetch error:", error);
//     res.status(500).json({ error: "Failed to fetch chat history", success: false });
//   }
// });

// Get all students (for parent dashboard)
app.get("/api/students", authenticateToken, async (req, res) => {
  try {
    if (req.user.userType !== 'parent') {
      return res.status(403).json({ error: "Access denied. Parent accounts only.", success: false });
    }
    
    const students = await db.collection("users")
      .find({ userType: 'student' })
      .project({ password: 0 }) // Exclude password
      .toArray();
    
    res.json({ students, success: true });
  } catch (error) {
    console.error("Students fetch error:", error);
    res.status(500).json({ error: "Failed to fetch students", success: false });
  }
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "OK", 
    timestamp: new Date().toISOString(),
    database: db ? "Connected" : "Disconnected"
  });
});

// Catch-all handler - MUST BE LAST
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// // Start server
// const PORT = process.env.PORT || 3000;
// connectDB().then(() => {
//   app.listen(PORT, () => {
//     console.log(`🚀 Server running on http://localhost:${PORT}`)
//   });
// });

process.on("SIGINT", async () => {
  console.log("Shutting down gracefully...");
  await client.close();
  process.exit(0);
});