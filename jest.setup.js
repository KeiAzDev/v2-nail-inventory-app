import '@testing-library/jest-dom'

// 必要に応じて追加のセットアップ
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}))