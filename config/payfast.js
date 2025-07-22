const keys = require('./keys')

// Get PayFast configuration from keys
const payfastConfig = keys.payfast

module.exports = {
  payfastConfig,
  currentConfig: payfastConfig,
} 