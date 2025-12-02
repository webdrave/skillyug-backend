
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const sessionId = 'cmip53ty80001jpjhfl1ezoa8';
  console.log(`Checking session: ${sessionId}`);

  try {
    const session = await prisma.scheduledSession.findUnique({
      where: { id: sessionId },
      include: {
        mentorProfile: true,
        course: true,
        liveStream: true,
        ivsChannel: true,
      },
    });

    if (session) {
      console.log('Session found:', JSON.stringify(session, null, 2));

      // Simulate access check
      // We need a user ID. Let's find the mentor first.
      const mentorUserId = session.mentorProfile.userId;
      console.log(`Mentor User ID: ${mentorUserId}`);

      // Check if mentor has access (should be true)
      const hasAccess = await prisma.scheduledSession.findFirst({
        where: {
          id: sessionId,
          OR: [
            {
              courseId: { not: null },
              course: {
                enrollments: {
                  some: {
                    userId: mentorUserId,
                    status: 'ACTIVE',
                  },
                },
              },
            },
            {
              mentorProfile: {
                userId: mentorUserId,
              },
            },
          ],
        },
      });
      console.log(`Mentor access check result: ${!!hasAccess}`);

    } else {
      console.log('Session not found');
    }
  } catch (error) {
    console.error('Error querying session:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
