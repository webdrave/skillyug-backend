import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Enabling all channels and resetting status...');
  
  const result = await prisma.iVSChannel.updateMany({
    data: { 
      isEnabled: true, 
      isActive: false,
      assignedToSessionId: null 
    }
  });

  console.log(`✅ Updated ${result.count} channels.`);
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
