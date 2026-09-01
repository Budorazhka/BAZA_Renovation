import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { rules as localI18nRules } from './scripts/i18n/eslint-plugin-local-i18n.mjs';

const localI18nPlugin = {
  rules: localI18nRules,
};

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'scripts', 'tests'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'local-i18n': localI18nPlugin,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      'local-i18n/no-cyrillic-jsx': 'warn',
    },
  }
);
