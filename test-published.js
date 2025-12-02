const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  try {
    console.log('All courses:', await prisma.course.count());
    console.log('Published courses:', await prisma.course.count({ where: { isPublished: true } }));
    console.log('Unpublished courses:', await prisma.course.count({ where: { isPublished: false } }));
    
    const allCourses = await prisma.course.findMany({
      select: { id: true, courseName: true, isPublished: true },
      take: 3
    });
    console.log('\nSample courses:', allCourses);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

test();
