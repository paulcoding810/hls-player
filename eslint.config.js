import pluginJs from '@eslint/js'
import pluginReact from 'eslint-plugin-react'
import globals from 'globals'

/** @type {import('eslint').Linter.Config[]} */
export default [
  { files: ['**/*.{js,mjs,cjs,jsx}'] },
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        chrome: true,
        browser: true,
        process: true,
      },
    },
  },
  pluginJs.configs.recommended,
  pluginReact.configs.flat.recommended,
  {
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      'no-unused-vars': 'off',
      'react/no-unescaped-entities': 'off',
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'no-async-promise-executor': 'off',
      // A module-level const read by an earlier one throws only at run time
      // (TDZ), so the linter is the one thing that catches it. Function
      // declarations stay exempt — this file's helpers are hoisted on purpose.
      'no-use-before-define': ['error', { variables: true, functions: false, classes: false }],
    },
  },
  {
    // Tests run in Node, not the browser, and stub globals as they need them.
    files: ['test/**'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    ignores: ['build', 'packages'],
  },
]
