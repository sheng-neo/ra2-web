import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', 'game-data/**', '**/*.d.ts'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // 模拟内核必须确定性：禁止真实时间、内建随机数与浮点三角函数。
    // 锁步联机要求所有客户端逐 tick 算出完全相同的世界状态。
    files: ['packages/game/src/**/*.ts'],
    ignores: ['packages/game/src/**/*.test.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: '模拟层禁用 Math.random，使用 sim 内的种子 PRNG' },
        { object: 'Date', property: 'now', message: '模拟层禁止读取真实时间' },
        { object: 'performance', property: 'now', message: '模拟层禁止读取真实时间' },
        { object: 'Math', property: 'sin', message: '使用查表三角（fixed.ts），保证跨平台确定性' },
        { object: 'Math', property: 'cos', message: '使用查表三角（fixed.ts），保证跨平台确定性' },
        { object: 'Math', property: 'tan', message: '使用查表三角（fixed.ts），保证跨平台确定性' },
        { object: 'Math', property: 'atan2', message: '使用整数方向计算（fixed.ts）' },
        { object: 'Math', property: 'sqrt', message: '使用整数距离计算（fixed.ts）' },
        { object: 'Math', property: 'hypot', message: '使用整数距离计算（fixed.ts）' },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'Date', message: '模拟层禁止读取真实时间' },
      ],
    },
  },
);
