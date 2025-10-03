export default {
  root: true,
  env: {
    es2022: true,
    node: true
  },
  extends: ['standard'],
  parserOptions: {
    sourceType: 'module'
  },
  rules: {
    'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off'
  }
};
