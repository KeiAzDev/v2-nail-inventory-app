// prisma-setup-test.js
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { execSync } = require('child_process');
const { PrismaClient } = require('@prisma/client');
const { URL } = require('url');

async function setupAndApplyPrisma() {
  let mongoReplSet;
  let prisma;

  try {
    console.log('Starting MongoDB replica set...');
    mongoReplSet = await MongoMemoryReplSet.create({
      replSet: {
        count: 1,
        storageEngine: 'wiredTiger'
      },
      instanceOpts: [
        {
          dbName: 'nail_inventory_test'
        }
      ]
    });
    
    await mongoReplSet.waitUntilRunning();
    
    // 基本URIを取得
    const baseUri = mongoReplSet.getUri();
    
    // URL解析して正しい形式のURIを作成
    const url = new URL(baseUri);
    url.pathname = '/nail_inventory_test';
    const uri = url.toString();
    
    console.log(`MongoDB replica set started with URI: ${uri}`);
    
    // 環境変数を設定（Prisma CLIが使用）
    process.env.DATABASE_URL = uri;
    
    // Prismaスキーマを適用
    console.log('Applying Prisma schema to database...');
    try {
      execSync('npx prisma db push --accept-data-loss', { 
        stdio: 'inherit',
        env: { ...process.env, DATABASE_URL: uri }
      });
      console.log('Prisma schema applied successfully');
    } catch (e) {
      console.error('Failed to apply schema. Exact DATABASE_URL:', uri);
      throw e;
    }
    
    // Prisma クライアントを生成
    console.log('Generating Prisma client...');
    execSync('npx prisma generate', { stdio: 'inherit' });
    console.log('Prisma client generated successfully');
    
    // 接続テスト
    console.log('Testing database connection...');
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: uri
        }
      }
    });
    
    await prisma.$connect();
    console.log('Connected to database successfully');
    
    // テスト用のstoreを作成
    console.log('Creating test Store...');
    const store = await prisma.store.create({
      data: {
        name: 'Test Store',
        code: 'TEST001',
        adminEmail: 'test@example.com'
      }
    });
    console.log('Store created successfully:', store);

    return 'Setup completed successfully';
  } catch (error) {
    console.error('Setup failed:', error);
    throw error;
  } finally {
    // クリーンアップ
    if (prisma) {
      await prisma.$disconnect();
      console.log('Prisma disconnected');
    }
    if (mongoReplSet) {
      await mongoReplSet.stop();
      console.log('MongoDB replica set stopped');
    }
  }
}

setupAndApplyPrisma()
  .then(result => {
    console.log(result);
    process.exit(0);
  })
  .catch(error => {
    console.error('Process failed:', error);
    process.exit(1);
  });