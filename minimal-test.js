// minimal-test.js
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { PrismaClient } = require('@prisma/client');

// グローバル変数
let mongoReplSet;
let prisma;

async function setupDatabase() {
  console.log('Setting up MongoDB replica set...');
  
  // 1. MongoDBレプリカセットのセットアップ
  mongoReplSet = await MongoMemoryReplSet.create({
    replSet: { 
      count: 1, 
      storageEngine: 'wiredTiger',
      dbName: 'test'
    }
  });
  
  await mongoReplSet.waitUntilRunning();
  const uri = mongoReplSet.getUri();
  console.log('MongoDB Replica Set URI:', uri);
  
  // 2. 環境変数の設定
  process.env.DATABASE_URL = uri;
  
  // 3. Prismaクライアントのセットアップ
  prisma = new PrismaClient();
  await prisma.$connect();
  console.log('Connected to database');
  
  return { mongoReplSet, prisma, uri };
}

async function cleanupDatabase() {
  console.log('Cleaning up...');
  if (prisma) {
    await prisma.$disconnect();
    console.log('Prisma disconnected');
  }
  if (mongoReplSet) {
    await mongoReplSet.stop();
    console.log('MongoDB replica set stopped');
  }
  console.log('Cleanup complete');
}

// 最小限のテスト
async function runTest() {
  try {
    await setupDatabase();
    
    console.log('Creating test store...');
    // テスト用のシンプルなstoreを作成
    const store = await prisma.store.create({
      data: {
        name: 'Test Store',
        code: 'TEST001',
        adminEmail: 'test@example.com'
      }
    });
    
    console.log('Successfully created store:', store);
    
    // 成功の確認
    const count = await prisma.store.count();
    console.log('Store count:', count);
    
    return 'Test passed!';
  } catch (error) {
    console.error('Test failed:', error);
    throw error;
  } finally {
    await cleanupDatabase();
  }
}

// テストを実行
runTest()
  .then(result => {
    console.log(result);
    process.exit(0);
  })
  .catch(error => {
    console.error('Test execution failed:', error);
    process.exit(1);
  });