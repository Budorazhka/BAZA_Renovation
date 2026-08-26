const baseConfig = require('@baza/eslint-config');

module.exports = [
  ...baseConfig,
  {
    // schema.ts — auto-generated openapi-typescript output, не ручной код,
    // не подчиняется project-стилю (например, содержит длинные строки,
    // any в местах, которые генератор не может типизировать точнее).
    ignores: ['src/schema.ts'],
  },
];
