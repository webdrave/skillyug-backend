/**
 * Switch from Mock Mode to Production Mode
 * This script helps you transition to real AWS IVS streaming
 */

import { PrismaClient } from '@prisma/client';
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query: string): Promise<string> {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function main() {
  console.log('🔄 Switch to Production Mode (Real AWS IVS)\n');
  
  // Check current mode
  const envPath = path.join(__dirname, '..', '.env');
  let envContent = '';
  
  try {
    envContent = fs.readFileSync(envPath, 'utf-8');
  } catch (error) {
    console.log('⚠️  No .env file found. Will create one.\n');
  }

  const isMockMode = envContent.includes('USE_MOCK_STREAMING=true');
  
  if (isMockMode) {
    console.log('📊 Current Mode: 🎭 MOCK (Development)\n');
  } else {
    console.log('📊 Current Mode: ☁️  AWS (Production)\n');
    const answer = await question('Already in production mode. Continue anyway? (yes/no): ');
    if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
      console.log('\n✅ Cancelled.');
      rl.close();
      return;
    }
  }

  // Check for existing mock channels
  const mockChannels = await prisma.iVSChannel.findMany({
    where: {
      channelArn: {
        contains: 'mock',
      },
    },
  });

  if (mockChannels.length > 0) {
    console.log(`\n⚠️  Found ${mockChannels.length} mock channels in database.`);
    console.log('These need to be deleted before creating real AWS channels.\n');
    
    const deleteAnswer = await question('Delete mock channels? (yes/no): ');
    if (deleteAnswer.toLowerCase() === 'yes' || deleteAnswer.toLowerCase() === 'y') {
      await prisma.iVSChannel.deleteMany({
        where: {
          channelArn: {
            contains: 'mock',
          },
        },
      });
      console.log('✅ Mock channels deleted.\n');
    }
  }

  // Get AWS credentials
  console.log('📝 AWS Credentials Setup\n');
  console.log('You need AWS IAM credentials with IVS permissions.\n');
  
  const region = await question('AWS Region (default: us-east-1): ') || 'us-east-1';
  const accessKeyId = await question('AWS Access Key ID: ');
  const secretAccessKey = await question('AWS Secret Access Key: ');

  if (!accessKeyId || !secretAccessKey) {
    console.log('\n❌ AWS credentials are required for production mode.');
    rl.close();
    return;
  }

  // Update .env file
  console.log('\n📝 Updating .env file...');
  
  let newEnvContent = envContent;
  
  // Remove or update mock mode
  if (newEnvContent.includes('USE_MOCK_STREAMING')) {
    newEnvContent = newEnvContent.replace(/USE_MOCK_STREAMING=.*/g, 'USE_MOCK_STREAMING=false');
  } else {
    newEnvContent += '\nUSE_MOCK_STREAMING=false';
  }

  // Update or add AWS credentials
  if (newEnvContent.includes('AWS_REGION')) {
    newEnvContent = newEnvContent.replace(/AWS_REGION=.*/g, `AWS_REGION=${region}`);
  } else {
    newEnvContent += `\nAWS_REGION=${region}`;
  }

  if (newEnvContent.includes('AWS_ACCESS_KEY_ID')) {
    newEnvContent = newEnvContent.replace(/AWS_ACCESS_KEY_ID=.*/g, `AWS_ACCESS_KEY_ID=${accessKeyId}`);
  } else {
    newEnvContent += `\nAWS_ACCESS_KEY_ID=${accessKeyId}`;
  }

  if (newEnvContent.includes('AWS_SECRET_ACCESS_KEY')) {
    newEnvContent = newEnvContent.replace(/AWS_SECRET_ACCESS_KEY=.*/g, `AWS_SECRET_ACCESS_KEY=${secretAccessKey}`);
  } else {
    newEnvContent += `\nAWS_SECRET_ACCESS_KEY=${secretAccessKey}`;
  }

  // Update NODE_ENV
  if (newEnvContent.includes('NODE_ENV')) {
    newEnvContent = newEnvContent.replace(/NODE_ENV=.*/g, 'NODE_ENV=production');
  } else {
    newEnvContent += '\nNODE_ENV=production';
  }

  fs.writeFileSync(envPath, newEnvContent);
  console.log('✅ .env file updated.\n');

  // Ask about creating channels
  const createAnswer = await question('Create AWS IVS channels now? (yes/no): ');
  
  if (createAnswer.toLowerCase() === 'yes' || createAnswer.toLowerCase() === 'y') {
    const countAnswer = await question('How many channels? (default: 3): ');
    const count = parseInt(countAnswer) || 3;
    
    console.log(`\n🔨 Creating ${count} AWS IVS channels...`);
    console.log('This may take a minute...\n');
    
    // Note: We can't directly call the init script here, so we'll instruct the user
    console.log('Please run this command in a new terminal:');
    console.log(`  INIT_CHANNELS_COUNT=${count} pnpm run channels:init\n`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('✨ Production Mode Setup Complete!\n');
  console.log('📋 Next Steps:\n');
  console.log('1. Restart your backend: pnpm run dev');
  console.log('2. Create AWS IVS channels: pnpm run channels:init');
  console.log('3. Get credentials from mentor dashboard');
  console.log('4. Configure OBS with real credentials');
  console.log('5. Start streaming!\n');
  console.log('💡 Your stream keys will now work with OBS Studio.');
  console.log('='.repeat(60) + '\n');

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
