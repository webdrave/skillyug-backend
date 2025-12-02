import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { UserType } from '@prisma/client';
import prisma from '../utils/prisma';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userType?: UserType;
}

interface JwtPayload {
  id: string;
  email: string;
  userType: UserType;
}

/**
 * Socket.IO Server for real-time features
 * - Live chat
 * - Quizzes
 * - Attendance tracking
 * - Session updates
 */
export class StreamingSocketServer {
  private io: SocketIOServer;
  private sessionParticipants: Map<string, Set<string>> = new Map();

  constructor(httpServer: HTTPServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.FRONTEND_URL?.split(',') || ['http://localhost:3000'],
        methods: ['GET', 'POST'],
        credentials: true,
      },
      path: '/socket.io/',
    });

    this.setupMiddleware();
    this.setupEventHandlers();
  }

  /**
   * Authentication middleware
   */
  private setupMiddleware() {
    this.io.use(async (socket: AuthenticatedSocket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
        
        if (!token) {
          return next(new Error('Authentication required'));
        }

        if (!process.env.JWT_SECRET) {
          return next(new Error('JWT_SECRET not configured'));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET) as JwtPayload;
        socket.userId = decoded.id;
        socket.userType = decoded.userType;

        next();
      } catch {
        next(new Error('Invalid token'));
      }
    });
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers() {
    this.io.on('connection', (socket: AuthenticatedSocket) => {
      console.log(`Socket connected: ${socket.id}, User: ${socket.userId}`);

      // Join session room
      socket.on('session:join', async (data: { sessionId: string }) => {
        await this.handleSessionJoin(socket, data.sessionId);
      });

      // Leave session room
      socket.on('session:leave', async (data: { sessionId: string }) => {
        await this.handleSessionLeave(socket, data.sessionId);
      });

      // Chat messages
      socket.on('chat:send', async (data: { sessionId: string; message: string }) => {
        await this.handleChatMessage(socket, data);
      });

      // Quiz answer
      socket.on('quiz:answer', async (data: { quizId: string; answer: number; responseTime: number }) => {
        await this.handleQuizAnswer(socket, data);
      });

      // Disconnect
      socket.on('disconnect', () => {
        this.handleDisconnect(socket);
      });
    });
  }

  /**
   * Handle session join
   */
  private async handleSessionJoin(socket: AuthenticatedSocket, sessionId: string) {
    if (!socket.userId) return;

    try {
      // Verify session exists
      const session = await prisma.scheduledSession.findUnique({
        where: { id: sessionId },
      });

      if (!session) {
        socket.emit('error', { message: 'Session not found' });
        return;
      }

      // Join socket room
      socket.join(`session:${sessionId}`);

      // Track participant
      if (!this.sessionParticipants.has(sessionId)) {
        this.sessionParticipants.set(sessionId, new Set());
      }
      this.sessionParticipants.get(sessionId)!.add(socket.userId);

      // Create or update attendance record
      await prisma.sessionAttendance.upsert({
        where: {
          sessionId_userId: {
            sessionId,
            userId: socket.userId,
          },
        },
        create: {
          sessionId,
          userId: socket.userId,
          joinedAt: new Date(),
        },
        update: {
          joinedAt: new Date(),
          leftAt: null,
        },
      });

      // Notify room
      const participantCount = this.sessionParticipants.get(sessionId)!.size;
      this.io.to(`session:${sessionId}`).emit('attendance:update', {
        participantCount,
      });

      socket.emit('session:joined', {
        sessionId,
        participantCount,
      });

      console.log(`User ${socket.userId} joined session ${sessionId}`);
    } catch (error) {
      console.error('Error joining session:', error);
      socket.emit('error', { message: 'Failed to join session' });
    }
  }

  /**
   * Handle session leave
   */
  private async handleSessionLeave(socket: AuthenticatedSocket, sessionId: string) {
    if (!socket.userId) return;

    try {
      socket.leave(`session:${sessionId}`);

      // Remove participant
      const participants = this.sessionParticipants.get(sessionId);
      if (participants) {
        participants.delete(socket.userId);
        if (participants.size === 0) {
          this.sessionParticipants.delete(sessionId);
        }
      }

      // Update attendance
      const attendance = await prisma.sessionAttendance.findUnique({
        where: {
          sessionId_userId: {
            sessionId,
            userId: socket.userId,
          },
        },
      });

      if (attendance) {
        const duration = Math.floor((Date.now() - attendance.joinedAt.getTime()) / 1000);
        await prisma.sessionAttendance.update({
          where: { id: attendance.id },
          data: {
            leftAt: new Date(),
            duration: attendance.duration + duration,
          },
        });
      }

      // Notify room
      const participantCount = participants?.size || 0;
      this.io.to(`session:${sessionId}`).emit('attendance:update', {
        participantCount,
      });

      console.log(`User ${socket.userId} left session ${sessionId}`);
    } catch (error) {
      console.error('Error leaving session:', error);
    }
  }

  /**
   * Handle chat message
   */
  private async handleChatMessage(
    socket: AuthenticatedSocket,
    data: { sessionId: string; message: string }
  ) {
    if (!socket.userId) return;

    try {
      // Get user info
      const user = await prisma.user.findUnique({
        where: { id: socket.userId },
        select: {
          id: true,
          fullName: true,
          email: true,
          image: true,
          userType: true,
        },
      });

      if (!user) return;

      // Update chat count in attendance
      await prisma.sessionAttendance.update({
        where: {
          sessionId_userId: {
            sessionId: data.sessionId,
            userId: socket.userId,
          },
        },
        data: {
          chatMessages: {
            increment: 1,
          },
        },
      });

      // Broadcast message
      this.io.to(`session:${data.sessionId}`).emit('chat:message', {
        id: `${Date.now()}-${socket.id}`,
        userId: user.id,
        userName: user.fullName || user.email,
        userImage: user.image,
        userType: user.userType,
        message: data.message,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error sending chat message:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  }

  /**
   * Handle quiz answer
   */
  private async handleQuizAnswer(
    socket: AuthenticatedSocket,
    data: { quizId: string; answer: number; responseTime: number }
  ) {
    if (!socket.userId) return;

    try {
      // Get quiz
      const quiz = await prisma.sessionQuiz.findUnique({
        where: { id: data.quizId },
      });

      if (!quiz) {
        socket.emit('error', { message: 'Quiz not found' });
        return;
      }

      // Check if already answered
      const existing = await prisma.quizResponse.findUnique({
        where: {
          quizId_userId: {
            quizId: data.quizId,
            userId: socket.userId,
          },
        },
      });

      if (existing) {
        socket.emit('error', { message: 'Already answered this quiz' });
        return;
      }

      // Save response
      const isCorrect = data.answer === quiz.correctAnswer;
      const points = isCorrect ? quiz.points : 0;

      await prisma.quizResponse.create({
        data: {
          quizId: data.quizId,
          userId: socket.userId,
          answer: data.answer,
          isCorrect,
          responseTime: data.responseTime,
          points,
        },
      });

      // Update attendance quiz score
      await prisma.sessionAttendance.update({
        where: {
          sessionId_userId: {
            sessionId: quiz.sessionId,
            userId: socket.userId,
          },
        },
        data: {
          quizScore: {
            increment: points,
          },
        },
      });

      socket.emit('quiz:answered', {
        isCorrect,
        points,
        correctAnswer: quiz.correctAnswer,
      });

      console.log(`User ${socket.userId} answered quiz ${data.quizId}`);
    } catch (error) {
      console.error('Error submitting quiz answer:', error);
      socket.emit('error', { message: 'Failed to submit answer' });
    }
  }

  /**
   * Handle disconnect
   */
  private handleDisconnect(socket: AuthenticatedSocket) {
    console.log(`Socket disconnected: ${socket.id}`);

    // Clean up all session participations
    this.sessionParticipants.forEach((participants, sessionId) => {
      if (socket.userId && participants.has(socket.userId)) {
        participants.delete(socket.userId);
        this.io.to(`session:${sessionId}`).emit('attendance:update', {
          participantCount: participants.size,
        });
      }
    });
  }

  /**
   * Public methods for server-side events
   */

  /**
   * Launch quiz to session
   */
  public launchQuiz(sessionId: string, quizData: unknown) {
    this.io.to(`session:${sessionId}`).emit('quiz:launched', quizData);
  }

  /**
   * End quiz
   */
  public endQuiz(sessionId: string, quizId: string) {
    this.io.to(`session:${sessionId}`).emit('quiz:ended', { quizId });
  }

  /**
   * Notify session started
   */
  public notifySessionStarted(sessionId: string) {
    this.io.to(`session:${sessionId}`).emit('session:started', { sessionId });
  }

  /**
   * Notify session ended
   */
  public notifySessionEnded(sessionId: string) {
    this.io.to(`session:${sessionId}`).emit('session:ended', { sessionId });
  }

  /**
   * Get participant count for session
   */
  public getParticipantCount(sessionId: string): number {
    return this.sessionParticipants.get(sessionId)?.size || 0;
  }

  /**
   * Get socket.io instance
   */
  public getIO(): SocketIOServer {
    return this.io;
  }
}

let socketServer: StreamingSocketServer | null = null;

export function initializeSocketServer(httpServer: HTTPServer): StreamingSocketServer {
  if (!socketServer) {
    socketServer = new StreamingSocketServer(httpServer);
  }
  return socketServer;
}

export function getSocketServer(): StreamingSocketServer {
  if (!socketServer) {
    throw new Error('Socket server not initialized');
  }
  return socketServer;
}
