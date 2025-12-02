const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testMentorCourses() {
  try {
    console.log('\n=== Testing Mentor Courses ===\n');
    
    // 1. Check if there are any courses
    const allCourses = await prisma.course.findMany({
      select: {
        id: true,
        courseName: true,
        mentorId: true,
        mentor: {
          select: {
            id: true,
            fullName: true,
            email: true,
            userType: true,
          }
        }
      }
    });
    
    console.log(`Total courses in database: ${allCourses.length}`);
    if (allCourses.length > 0) {
      console.log('\nCourses:');
      allCourses.forEach(course => {
        console.log(`- ${course.courseName}`);
        console.log(`  Mentor: ${course.mentor?.fullName || 'None'} (${course.mentor?.email || 'N/A'})`);
        console.log(`  MentorId: ${course.mentorId}`);
      });
    }
    
    // 2. Check if there are any users with MENTOR type
    const mentors = await prisma.user.findMany({
      where: { userType: 'MENTOR' },
      select: {
        id: true,
        fullName: true,
        email: true,
        userType: true,
        coursesAsMentor: {
          select: {
            id: true,
            courseName: true,
          }
        }
      }
    });
    
    console.log(`\nTotal mentors in database: ${mentors.length}`);
    if (mentors.length > 0) {
      console.log('\nMentors:');
      mentors.forEach(mentor => {
        console.log(`- ${mentor.fullName} (${mentor.email})`);
        console.log(`  ID: ${mentor.id}`);
        console.log(`  Courses: ${mentor.coursesAsMentor.length}`);
        if (mentor.coursesAsMentor.length > 0) {
          mentor.coursesAsMentor.forEach(course => {
            console.log(`    - ${course.courseName}`);
          });
        }
      });
    }
    
    // 3. Check mentor profiles
    const mentorProfiles = await prisma.mentorProfile.findMany({
      select: {
        id: true,
        userId: true,
        user: {
          select: {
            fullName: true,
            email: true,
          }
        }
      }
    });
    
    console.log(`\nTotal mentor profiles: ${mentorProfiles.length}`);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testMentorCourses();
