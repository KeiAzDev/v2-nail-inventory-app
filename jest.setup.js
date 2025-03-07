// jest.setup.js
const { MongoMemoryReplSet } = require('mongodb-memory-server');

// テストのタイムアウト時間を延長（レプリカセットの起動に時間がかかる場合があります）
jest.setTimeout(60000);

// グローバルモンゴレプリカセット
let mongoReplSet;

global.beforeAll(async () => {
  try {
    console.log('Starting MongoDB replica set...');
    mongoReplSet = await MongoMemoryReplSet.create({
      replSet: {
        count: 1,
        storageEngine: 'wiredTiger',
        dbName: 'test'
      }
    });
    
    await mongoReplSet.waitUntilRunning();
    const uri = mongoReplSet.getUri();
    process.env.DATABASE_URL = uri;
    console.log(`MongoDB replica set started with URI: ${uri}`);
  } catch (error) {
    console.error('Failed to start MongoDB replica set:', error);
  }
});

global.afterAll(async () => {
  try {
    if (mongoReplSet) {
      await mongoReplSet.stop();
      console.log('MongoDB replica set stopped');
    }
  } catch (error) {
    console.error('Failed to stop MongoDB replica set:', error);
  }
});

// 警告を抑制
const originalConsoleWarn = console.warn;
console.warn = (...args) => {
  // Prisma関連の特定の警告メッセージをフィルタリング
  const message = args[0];
  if (typeof message === 'string' && 
      (message.includes('Prisma') || 
      message.includes('deprecated'))) {
    return;
  }
  originalConsoleWarn(...args);
};