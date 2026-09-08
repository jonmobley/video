#!/usr/bin/env node
const { missingRequiredMessage } = require('./collect-worker-secrets');

const message = missingRequiredMessage();
if (message) {
  console.error(message);
  process.exit(1);
}
