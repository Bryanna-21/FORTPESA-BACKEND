module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: './tsconfig.json',
    sourceType: 'module',
    ecmaVersion: 2022,
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  env: {
    node: true,
    es2022: true,
  },
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-floating-promises': 'error',
    'no-console': ['error', { allow: ['error'] }],
    'no-restricted-syntax': [
      'error',
      {
        selector: "BinaryExpression[operator=/^[+\\-*/]$/][left.name='amount']",
        message: 'Do not perform arithmetic directly on amount fields; use the Money utility.',
      },
    ],
  },
  ignorePatterns: ['dist', 'node_modules', 'coverage'],
};
