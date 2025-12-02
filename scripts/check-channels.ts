/**
 * Check Channel Pool Status
 * Quick script to see current channel availability
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('📊 Channel Pool Status\n');

  const channels = await prisma.iVSChannel.findMany({
    include: {
      sessions: {
        where: { status: 'LIVE' },
        select: {
          id: true,
          title: true,
          startedAt: true,
        },
      },
    },
  });

  if (channels.length === 0) {
    console.log('❌ No channels found in the pool!');
    console.log('\n💡 Run: npm run init-channels');
    return;
  }

  console.log(`Total Channels: ${channels.length}\n`);

  channels.forEach((channel, index) => {
    const status = channel.isActive ? '🔴 Active' : '🟢 Free';
    const enabled = channel.isEnabled ? '' : '(Disabled)';
    
    console.log(`${index + 1}. ${channel.channelName} ${status} ${enabled}`);
    
    if (channel.isActive && channel.assignedToSessionId) {
      console.log(`   └─ Assigned to: ${channel.assignedToSessionId}`);
    }
    
    if (channel.sessions.length > 0) {
      channel.sessions.forEach(session => {
        console.log(`   └─ Live Session: ${session.title}`);
      });
    }
  });

  const stats = {
    total: channels.length,
    active: channels.filter(c => c.isActive).length,
    free: channels.filter(c => !c.isActive && c.isEnabled).length,
    disabled: channels.filter(c => !c.isEnabled).length,
  };

  console.log('\n📈 Summary:');
  console.log(`   Total: ${stats.total}`);
  console.log(`   Active: ${stats.active}`);
  console.log(`   Free: ${stats.free}`);
  console.log(`   Disabled: ${stats.disabled}`);

  if (stats.free === 0 && stats.active > 0) {
    console.log('\n⚠️  All channels are in use!');
    console.log('   Consider creating more channels: npm run init-channels');
  }

  if (stats.free > 0) {
    console.log('\n✅ Channels available for streaming');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
