// src/lib/inventory/product-service.ts
// テスト用のスタブ実装

/**
 * 新しい製品を登録する
 */
export async function createProduct(productData: any): Promise<any> {
  console.log('createProduct called', productData);
  return {
    success: true,
    productId: 'product123',
    lotId: 'lot123',
  };
}

/**
 * 製品の在庫を更新する
 */
export async function updateProductStock(updateData: any): Promise<any> {
  console.log('updateProductStock called', updateData);
  return {
    success: true,
    product: {
      id: updateData.productId,
      totalQuantity: 3,
      lotQuantity: 3,
    },
  };
}

/**
 * 製品の使用記録を登録する
 */
export async function recordProductUsage(usageData: any): Promise<any> {
  console.log('recordProductUsage called', usageData);
  return {
    success: true,
    usageId: 'usage123',
  };
}