const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkCourses() {
  try {
    const courses = await prisma.course.findMany({
      take: 5,
      select: {
        id: true,
        courseName: true,
        category: true,
        isPublished: true,
        createdAt: true
      }
    });
    
    console.log('Total courses in DB:', await prisma.course.count());
    console.log('Published courses:', await prisma.course.count({ where: { isPublished: true } }));
    console.log('\nFirst 5 courses:');
    console.log(JSON.stringify(courses, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkCourses();
