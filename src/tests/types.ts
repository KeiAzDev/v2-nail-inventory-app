// // src/tests/types.ts
// import { PrismaClient } from '@prisma/client';

// /**
//  * Jest関連の型拡張
//  */
// declare global {
//   namespace jest {
//     interface Mock<T = any, Y extends any[] = any[], C = any> {
//       mockResolvedValue: (value: T) => jest.Mock<Promise<T>, Y, C>;
//       mockRejectedValue: (reason: any) => jest.Mock<Promise<never>, Y, C>;
//       mockImplementation: (fn: (...args: Y) => T) => jest.Mock<T, Y, C>;
//     }
//   }
// }

// /**
//  * テスト用のモックPrismaクライアント型
//  */
// export type MockPrismaClient = {
//   [K in keyof PrismaClient]: {
//     [Method in keyof PrismaClient[K]]?: jest.Mock;
//   } & {
//     [key: string]: jest.Mock;
//   };
// } & {
//   $transaction: jest.Mock;
// };

// /**
//  * モックPrismaクライアントを作成するヘルパー関数
//  */
// export function createMockPrismaClient(): MockPrismaClient {
//   return {
//     store: {
//       create: jest.fn(),
//       findUnique: jest.fn(),
//       findMany: jest.fn(),
//       update: jest.fn(),
//     },
//     user: {
//       create: jest.fn(),
//       findUnique: jest.fn(),
//       findFirst: jest.fn(),
//       findMany: jest.fn(),
//       update: jest.fn(),
//     },
//     invitation: {
//       create: jest.fn(),
//       findUnique: jest.fn(),
//       findFirst: jest.fn(),
//       update: jest.fn(),
//       updateMany: jest.fn(),
//     },
//     product: {
//       create: jest.fn(),
//       findUnique: jest.fn(),
//       findMany: jest.fn(),
//       update: jest.fn(),
//     },
//     productLot: {
//       create: jest.fn(),
//       findMany: jest.fn(),
//       update: jest.fn(),
//     },
//     usage: {
//       create: jest.fn(),
//       findMany: jest.fn(),
//       groupBy: jest.fn(),
//     },
//     serviceType: {
//       findMany: jest.fn(),
//     },
//     $transaction: jest.fn((callback) => callback()),
//   } as MockPrismaClient;
// }

// /**
//  * Prismaのモデルに対するモックヘルパー
//  */
// export const mockHelpers = {
//   /**
//    * モックの解決値を設定する
//    */
//   mockResolvedValue: <T, Y extends any[] = any[], C = any>(
//     mock: jest.Mock<any, Y, C>, 
//     value: T
//   ): jest.Mock<Promise<T>, Y, C> => {
//     return mock.mockResolvedValue(value);
//   },

//   /**
//    * モックの実装を設定する
//    */
//   mockImplementation: <T, Y extends any[] = any[], C = any>(
//     mock: jest.Mock<any, Y, C>,
//     fn: (...args: Y) => T
//   ): jest.Mock<T, Y, C> => {
//     return mock.mockImplementation(fn);
//   },

//   /**
//    * トランザクションのモック実装
//    */
//   mockTransaction: <T, Y extends any[] = any[], C = any>(
//     transactionMock: jest.Mock<any, Y, C>,
//     result: T
//   ): jest.Mock<Promise<T>, Y, C> => {
//     return transactionMock.mockImplementation(async (callback: any) => {
//       return typeof callback === 'function' ? callback() : result;
//     });
//   },
// };