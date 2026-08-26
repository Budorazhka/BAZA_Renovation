const tseslint = require('typescript-eslint');
const baseConfig = require('./base');

module.exports = tseslint.config(...baseConfig, {
  languageOptions: {
    globals: {
      node: true,
      jest: true,
    },
  },
  rules: {
    '@typescript-eslint/explicit-module-boundary-types': 'off',
  },
});
