/**
 * Quick Setup Script
 * One command to set up everything for streaming
 */

import { PrismaClient } from '@prisma/client';
import { IvsClient, CreateChannelCommand, ChannelLatencyMode, ChannelType } from '@aws-sdk/client-ivs';
import * as readline from 'readline';

const prisma = new PrismaClient();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query: string): Promise<string> {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function main() {
  console.log('🚀 Streaming Setup Wizard\n');
  console.log('This will help you set up live streaming channels.\n');

  // Check if channels already exist
  const existingChannels = await prisma.iVSChannel.findMany();
  
  if (existingChannels.length > 0) {
    console.log(`⚠️  You already have ${existingChannels.length} channels.\n`);
    const answer = await question('Do you want to create more? (yes/no): ');
    if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
      console.log('\n✅ Setup cancelled. Your existing channels are ready to use.');
      rl.close();
      return;
    }
  }

  // Ask for mode
  console.log('\n📋 Choose your mode:\n');
  console.log('1. Development Mode (Mock - No AWS needed)');
  console.log('2. Production Mode (Real AWS IVS)\n');
  
  const modeAnswer = await question('Enter 1 or 2: ');
  const useMock = modeAnswer.trim() === '1';

  // Ask for number of channels
  const countAnswer = await question('\nHow many channels to create? (default: 3): ');
  const count = parseInt(countAnswer) || 3;

  console.log(`\n🔨 Creating ${count} ${useMock ? 'mock' : 'AWS IVS'} channels...\n`);

  const ivsClient = new IvsClient({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    },
  });

  let successCount = 0;

  for (let i = 1; i <= count; i++) {
    const channelName = `Channel-${Date.now()}-${i}`;
    
    try {
      console.log(`📡 Creating channel ${i}/${count}: ${channelName}...`);

      if (useMock) {
        // Create mock channel
        await prisma.iVSChannel.create({
          data: {
            channelArn: `arn:aws:ivs:us-east-1:mock:channel/${channelName}`,
            channelId: `mock-${Date.now()}-${i}`,
            channelName,
            ingestEndpoint: `mock-ingest-${i}.ivs.us-east-1.amazonaws.com`,
            playbackUrl: `https://mock-playback.ivs.amazonaws.com/stream/${channelName}.m3u8`,
            isActive: false,
            isEnabled: true,
          },
        });
        console.log(`   ✅ Mock channel created\n`);
      } else {
        // Create real AWS IVS channel
        const response = await ivsClient.send(
          new CreateChannelCommand({
            name: channelName,
            type: ChannelType.StandardChannelType,
            latencyMode: ChannelLatencyMode.LowLatency,
            authorized: false,
          })
        );

        const awsChannel = response.channel;
        if (!awsChannel?.arn) {
          throw new Error('No channel ARN returned');
        }

        await prisma.iVSChannel.create({
          data: {
            channelArn: awsChannel.arn,
            channelId: awsChannel.channelId || channelName,
            channelName: awsChannel.name || channelName,
            ingestEndpoint: awsChannel.ingestEndpoint || '',
            playbackUrl: awsChannel.playbackUrl || '',
            isActive: false,
            isEnabled: true,
          },
        });
        console.log(`   ✅ AWS IVS channel created\n`);
      }

      successCount++;
    } catch (error: any) {
      console.error(`   ❌ Failed: ${error.message}\n`);
    }

    // Small delay between creations
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Summary
  const allChannels = await prisma.iVSChannel.findMany();
  
  console.log('\n' + '='.repeat(50));
  console.log('✨ Setup Complete!\n');
  console.log(`📊 Channel Summary:`);
  console.log(`   Total channels: ${allChannels.length}`);
  console.log(`   Just created: ${successCount}`);
  console.log(`   Active: ${allChannels.filter(c => c.isActive).length}`);
  console.log(`   Available: ${allChannels.filter(c => !c.isActive && c.isEnabled).length}`);
  
  console.log('\n💡 Next Steps:\n');
  console.log('1. Start your backend: npm run dev');
  console.log('2. Check channels: npm run channels:check');
  console.log('3. View admin panel: http://localhost:3000/admin/channels');
  console.log('4. Mentors can now schedule sessions and get streaming credentials!');
  console.log('\n' + '='.repeat(50) + '\n');

  rl.close();
}

main()
  .catch((error) => {
    console.error('\n❌ Error:', error.message);
    rl.close();
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
