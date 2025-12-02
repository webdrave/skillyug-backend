import { PrismaClient, LiveStreamStatus } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Repository for LiveStream database operations
 */
export class LiveStreamRepository {
  /**
   * Create a new live stream record
   */
  async create(data: {
    mentorProfileId: string;
    courseId?: string;
    title: string;
    description?: string;
    channelArn: string;
    channelName: string;
    ingestEndpoint: string;
    playbackUrl: string;
    streamKeyArn: string;
    scheduledAt?: Date;
  }) {
    return prisma.liveStream.create({
      data,
      include: {
        mentorProfile: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                email: true,
                image: true,
              },
            },
          },
        },
        course: {
          select: {
            id: true,
            courseName: true,
            imageUrl: true,
          },
        },
      },
    });
  }

  /**
   * Find live stream by ID
   */
  async findById(id: string) {
    return prisma.liveStream.findUnique({
      where: { id },
      include: {
        mentorProfile: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                email: true,
                image: true,
              },
            },
          },
        },
        course: {
          select: {
            id: true,
            courseName: true,
            imageUrl: true,
          },
        },
        viewers: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                image: true,
              },
            },
          },
        },
      },
    });
  }

  /**
   * Find live stream by channel ARN
   */
  async findByChannelArn(channelArn: string) {
    return prisma.liveStream.findUnique({
      where: { channelArn },
      include: {
        mentorProfile: {
          include: {
            user: true,
          },
        },
        course: true,
      },
    });
  }

  /**
   * Update live stream
   */
  async update(id: string, data: {
    title?: string;
    description?: string;
    status?: LiveStreamStatus;
    isActive?: boolean;
    scheduledAt?: Date;
    startedAt?: Date;
    endedAt?: Date;
    viewerCount?: number;
    maxViewers?: number;
  }) {
    return prisma.liveStream.update({
      where: { id },
      data,
      include: {
        mentorProfile: {
          include: {
            user: true,
          },
        },
        course: true,
      },
    });
  }

  /**
   * Delete live stream
   */
  async delete(id: string) {
    return prisma.liveStream.delete({
      where: { id },
    });
  }

  /**
   * Find all live streams by mentor
   */
  async findByMentor(mentorProfileId: string, params?: {
    status?: LiveStreamStatus;
    page?: number;
    limit?: number;
  }) {
    const page = params?.page || 1;
    const limit = params?.limit || 10;
    const skip = (page - 1) * limit;

    const where = {
      mentorProfileId,
      ...(params?.status && { status: params.status }),
    };

    const [streams, total] = await Promise.all([
      prisma.liveStream.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          course: {
            select: {
              id: true,
              courseName: true,
              imageUrl: true,
            },
          },
          viewers: {
            select: {
              id: true,
              userId: true,
            },
          },
        },
      }),
      prisma.liveStream.count({ where }),
    ]);

    return { streams, total };
  }

  /**
   * Find all live streams (with filters)
   */
  async findAll(params?: {
    status?: LiveStreamStatus;
    isActive?: boolean;
    courseId?: string;
    page?: number;
    limit?: number;
  }) {
    const page = params?.page || 1;
    const limit = params?.limit || 10;
    const skip = (page - 1) * limit;

    const where = {
      ...(params?.status && { status: params.status }),
      ...(params?.isActive !== undefined && { isActive: params.isActive }),
      ...(params?.courseId && { courseId: params.courseId }),
    };

    const [streams, total] = await Promise.all([
      prisma.liveStream.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          mentorProfile: {
            include: {
              user: {
                select: {
                  id: true,
                  fullName: true,
                  image: true,
                },
              },
            },
          },
          course: {
            select: {
              id: true,
              courseName: true,
              imageUrl: true,
            },
          },
        },
      }),
      prisma.liveStream.count({ where }),
    ]);

    return { streams, total };
  }

  /**
   * Find active/live streams
   */
  async findActiveStreams(params?: {
    page?: number;
    limit?: number;
  }) {
    return this.findAll({
      ...params,
      status: LiveStreamStatus.LIVE,
      isActive: true,
    });
  }

  /**
   * Add viewer to stream
   */
  async addViewer(liveStreamId: string, userId: string) {
    return prisma.streamViewer.upsert({
      where: {
        liveStreamId_userId: {
          liveStreamId,
          userId,
        },
      },
      create: {
        liveStreamId,
        userId,
      },
      update: {
        leftAt: null,
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            image: true,
          },
        },
      },
    });
  }

  /**
   * Remove viewer from stream
   */
  async removeViewer(liveStreamId: string, userId: string) {
    return prisma.streamViewer.update({
      where: {
        liveStreamId_userId: {
          liveStreamId,
          userId,
        },
      },
      data: {
        leftAt: new Date(),
      },
    });
  }

  /**
   * Update viewer watch time
   */
  async updateViewerWatchTime(liveStreamId: string, userId: string, watchTimeMin: number) {
    return prisma.streamViewer.update({
      where: {
        liveStreamId_userId: {
          liveStreamId,
          userId,
        },
      },
      data: {
        watchTimeMin,
      },
    });
  }

  /**
   * Get stream viewers
   */
  async getViewers(liveStreamId: string) {
    return prisma.streamViewer.findMany({
      where: {
        liveStreamId,
        leftAt: null,
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            image: true,
          },
        },
      },
    });
  }

  /**
   * Increment viewer count
   */
  async incrementViewerCount(id: string) {
    const stream = await prisma.liveStream.findUnique({
      where: { id },
      select: { viewerCount: true, maxViewers: true },
    });

    if (!stream) return null;

    const newViewerCount = stream.viewerCount + 1;
    const newMaxViewers = Math.max(stream.maxViewers, newViewerCount);

    return prisma.liveStream.update({
      where: { id },
      data: {
        viewerCount: newViewerCount,
        maxViewers: newMaxViewers,
      },
    });
  }

  /**
   * Decrement viewer count
   */
  async decrementViewerCount(id: string) {
    return prisma.liveStream.update({
      where: { id },
      data: {
        viewerCount: {
          decrement: 1,
        },
      },
    });
  }
}

// Export singleton instance
export const liveStreamRepository = new LiveStreamRepository();
