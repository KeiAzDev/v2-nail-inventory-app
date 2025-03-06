// src/lib/dashboard/statistics-service.ts
// テスト用のスタブ実装

/**
 * 店舗の在庫サマリーを取得する
 */
export async function getStoreInventorySummary(storeId: string): Promise<any> {
  console.log('getStoreInventorySummary called', storeId);
  return {
    totalProducts: 2,
    lowStockProducts: [],
    byCategoryCount: {
      POLISH_COLOR: 1,
      GEL_COLOR: 1,
    },
    recentlyUsedProducts: [],
  };
}

/**
 * 製品の使用統計を取得する
 */
export async function getProductUsageStatistics(params: any): Promise<any> {
  console.log('getProductUsageStatistics called', params);
  return {
    totalUsage: 15.7,
    usageByProduct: [
      {
        productId: 'product1',
        productName: 'Nail Lacquer Red',
        brand: 'OPI',
        totalUsage: 10.5,
        usageCount: 20,
      },
      {
        productId: 'product2',
        productName: 'Gel Couture',
        brand: 'Essie',
        totalUsage: 5.2,
        usageCount: 8,
      },
    ],
    usageTimeline: [],
  };
}