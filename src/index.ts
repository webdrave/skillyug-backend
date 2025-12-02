import express, { Request, Response, NextFunction, urlencoded } from "express"
import { createServer } from "http"
import dotenv from "dotenv"
import Razorpay from "razorpay"
import cors from "cors"
import helmet from "helmet"
import morgan from "morgan"
import prisma from "./utils/prisma"
import authRouter from "./router/auth.router"
import courseRouter from "./router/course.router"
import paymentRouter from "./router/payment.router"
import purchaseRouter from "./router/purchase.router"
import userRouter from "./router/userRouter"
import recommendationRouter from "./router/recommendation.router"
import mentorRouter from "./router/mentor.router"
import streamingRouter from "./router/streaming.router"
import sessionRouter from "./router/session.router"
import quizRouter from "./router/quiz.router"
import enrollmentRouter from "./router/enrollment.router"
import studentRouter from "./router/student.router"
import ivsSimpleRouter from "./router/ivs-simple.router"
import { globalErrorHandler } from "./middleware/errorHandler.middleware"
import { initializeSocketServer } from "./socket/streaming.socket"

dotenv.config()

// Database Connection
async function connectToDatabase() {
  try {
    await prisma.$connect();
    console.log('✅ Database connected');
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    process.exit(1);
  }
}

connectToDatabase();

// Razorpay Setup
if (!process.env.RAZORPAY_KEY || !process.env.RAZORPAY_SECRET) {
    console.error("❌ Razorpay credentials missing in .env");
    process.exit(1);
}

export const instance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY,
    key_secret: process.env.RAZORPAY_SECRET
});

// Express App
const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 5000;
app.set('trust proxy', 1);

// Middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// CORS Configuration - Restricted to specific origins
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://frontend:3000',
  'https://skillyug-frontend.vercel.app',
  process.env.FRONTEND_URL,
  process.env.NEXT_PUBLIC_FRONTEND_URL,
].filter(Boolean) as string[];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, server-to-server)
    if (!origin) return callback(null, true);
    
    // Check if origin is allowed or is a Vercel preview deployment
    if (allowedOrigins.includes(origin) || origin.match(/^https:\/\/.*\.vercel\.app$/)) {
      callback(null, true);
    } else {
      console.warn(`🚫 CORS blocked: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'X-User-ID', 'X-User-Type'],
  maxAge: 86400, // 24 hours
}));

app.use(morgan('dev'));
app.use(express.json({ limit: '10kb' }));
app.use(urlencoded({ extended: true }));

// Health Check Routes
app.get('/api/test', (req: Request, res: Response) => {
    res.status(200).json({ 
        message: 'Backend API is working!',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

app.get("/", (req: Request, res: Response) => {
    res.status(200).send("<h1>Backend is up and running!</h1>");
});

app.get('/api/getKey', (req: Request, res: Response) => {
    res.status(200).json({ key: process.env.RAZORPAY_KEY });
});

// API Routes
app.use("/api/auth", authRouter);
app.use("/api/courses", courseRouter);
app.use("/api/payments", paymentRouter);
app.use("/api/purchases", purchaseRouter);
app.use("/api/users", userRouter);
app.use("/api/recommendations", recommendationRouter);
app.use("/api/mentor", mentorRouter);
app.use("/api/streams", streamingRouter);
app.use("/api/sessions", sessionRouter);
app.use("/api/quizzes", quizRouter);
app.use("/api/enrollments", enrollmentRouter);
app.use("/api/student", studentRouter);
app.use("/", ivsSimpleRouter);

// 404 Handler
app.use((req: Request, res: Response, _next: NextFunction) => {
    res.status(404).json({
        status: 'fail',
        message: `Route not found: ${req.originalUrl}`
    });
});

// Global Error Handler
app.use(globalErrorHandler);

// Initialize Socket.IO
initializeSocketServer(httpServer);

// Start Server
const server = httpServer.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔒 CORS enabled for: ${allowedOrigins.join(', ')}`);
    console.log(`🔌 Socket.IO initialized`);
});

// Graceful Shutdown
const shutdown = async (signal: string) => {
    console.log(`\n🚨 ${signal} received. Shutting down...`);
    server.close(async () => {
        await prisma.$disconnect();
        console.log('✅ Server closed');
        process.exit(0);
    });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;