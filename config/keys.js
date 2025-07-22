console.log('NODE_ENV:', process.env.NODE_ENV)

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./keys-prod').keys
} else {
  module.exports = require('./keys-dev').keys
} 