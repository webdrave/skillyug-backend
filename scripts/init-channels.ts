/**
 * Initialize IVS Channel Pool
 * Run this script to create initial channels for streaming
 * 
 * Usage:
 *   npm run init-channels
 *   or
 *   npx ts-node scripts/init-channels.ts
 */

import { PrismaClient } from '@prisma/client';
import { IvsClient, CreateChannelCommand, ChannelLatencyMode, ChannelType } from '@aws-sdk/client-ivs';

const prisma = new PrismaClient();

const USE_MOCK = process.env.USE_MOCK_STREAMING === 'true' || process.env.NODE_ENV === 'development';

const ivsClient = new IvsClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

async function createChannel(name: string, index: number) {
  console.log(`\n📡 Creating channel ${index}: ${name}...`);

  if (USE_MOCK) {
    // Create mock channel
    const channel = await prisma.iVSChannel.create({
      data: {
        channelArn: `arn:aws:ivs:us-east-1:mock:channel/${name}`,
        channelId: `mock-${Date.now()}-${index}`,
        channelName: name,
        ingestEndpoint: `mock-ingest-${index}.ivs.us-east-1.amazonaws.com`,
        playbackUrl: `https://mock-playback.ivs.amazonaws.com/stream/${name}.m3u8`,
        isActive: false,
        isEnabled: true,
      },
    });

    console.log(`✅ Mock channel created: ${channel.id}`);
    return channel;
  }

  // Create real AWS IVS channel
  try {
    const response = await ivsClient.send(
      new CreateChannelCommand({
        name,
        type: ChannelType.StandardChannelType,
        latencyMode: ChannelLatencyMode.LowLatency,
        authorized: false,
        recordingConfigurationArn: process.env.IVS_RECORDING_ARN || undefined,
        tags: {
          environment: process.env.NODE_ENV || 'development',
          createdBy: 'init-script',
          createdAt: new Date().toISOString(),
        },
      })
    );

    const awsChannel = response.channel;
    if (!awsChannel?.arn) {
      throw new Error('No channel ARN returned from AWS');
    }

    // Save to database
    const channel = await prisma.iVSChannel.create({
      data: {
        channelArn: awsChannel.arn,
        channelId: awsChannel.channelId || name,
        channelName: awsChannel.name || name,
        ingestEndpoint: awsChannel.ingestEndpoint || '',
        playbackUrl: awsChannel.playbackUrl || '',
        isActive: false,
        isEnabled: true,
      },
    });

    console.log(`✅ AWS IVS channel created: ${channel.id}`);
    console.log(`   ARN: ${channel.channelArn}`);
    console.log(`   Playback: ${channel.playbackUrl}`);
    
    return channel;
  } catch (error: any) {
    console.error(`❌ Failed to create channel: ${error.message}`);
    throw error;
  }
}

async function main() {
  console.log('🚀 Initializing IVS Channel Pool...\n');
  console.log(`Mode: ${USE_MOCK ? '🎭 MOCK (Development)' : '☁️  AWS (Production)'}`);
  console.log(`Region: ${process.env.AWS_REGION || 'us-east-1'}`);

  // Check existing channels
  const existingChannels = await prisma.iVSChannel.findMany();
  console.log(`\n📊 Existing channels: ${existingChannels.length}`);

  if (existingChannels.length > 0) {
    console.log('\n⚠️  Channels already exist:');
    existingChannels.forEach((ch, i) => {
      console.log(`   ${i + 1}. ${ch.channelName} (${ch.isActive ? '🔴 Active' : '🟢 Free'})`);
    });

    console.log('\n❓ Do you want to create more channels? (Ctrl+C to cancel)');
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  // Create channels
  const numberOfChannels = parseInt(process.env.INIT_CHANNELS_COUNT || '3');
  console.log(`\n🔨 Creating ${numberOfChannels} new channels...`);

  const channels = [];
  for (let i = 1; i <= numberOfChannels; i++) {
    const channelName = `Channel-${Date.now()}-${i}`;
    try {
      const channel = await createChannel(channelName, i);
      channels.push(channel);
    } catch (error) {
      console.error(`Failed to create channel ${i}, continuing...`);
    }
  }

  console.log(`\n✅ Successfully created ${channels.length} channels`);

  // Summary
  const allChannels = await prisma.iVSChannel.findMany();
  console.log('\n📊 Channel Pool Summary:');
  console.log(`   Total channels: ${allChannels.length}`);
  console.log(`   Active: ${allChannels.filter(c => c.isActive).length}`);
  console.log(`   Free: ${allChannels.filter(c => !c.isActive && c.isEnabled).length}`);
  console.log(`   Disabled: ${allChannels.filter(c => !c.isEnabled).length}`);

  console.log('\n✨ Channel pool initialization complete!');
  console.log('\n💡 Next steps:');
  console.log('   1. Mentors can now schedule sessions');
  console.log('   2. Get credentials: GET /mentor/sessions/:sessionId/credentials');
  console.log('   3. Configure OBS with the credentials');
  console.log('   4. Start streaming: POST /mentor/sessions/:sessionId/start');
}

main()
  .catch((error) => {
    console.error('\n❌ Error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
