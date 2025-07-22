const keys = {
  mongo: {
    url: function () {
      return process.env.MONGODB_URL || 'your_production_mongodb_url_here'
    },
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      ssl: true,
      tls: true,
      tlsAllowInvalidCertificates: true,
      tlsAllowInvalidHostnames: true,
      retryWrites: true,
      w: 'majority',
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
    },
  },
  email: {
    host: 'smtp.zoho.com',
    port: 587,
    secure: false,
    user: 'hello@nukebrand.com',
    pass: process.env.EMAIL_PASSWORD || 'your_production_zoho_password_here',
  },
  payfast: {
    merchantId: process.env.PAYFAST_MERCHANT_ID || 'YOUR_PRODUCTION_MERCHANT_ID',
    merchantKey: process.env.PAYFAST_MERCHANT_KEY || 'YOUR_PRODUCTION_MERCHANT_KEY',
    returnUrl: process.env.PAYFAST_RETURN_URL || 'https://4d1507650a18.ngrok-free.app/payment/success',
    cancelUrl: process.env.PAYFAST_CANCEL_URL || 'https://4d1507650a18.ngrok-free.app/payment/cancel',
    notifyUrl: process.env.PAYFAST_NOTIFY_URL || 'https://4d1507650a18.ngrok-free.app/api/payments/notify',
    passPhrase: process.env.PAYFAST_PASSPHRASE || 'YOUR_PRODUCTION_PASSPHRASE',
    testMode: false,
    baseUrl: 'https://www.payfast.co.za/eng/process',
  },
  latestAppVersion: {
    v: '1.0.0',
  },
}

exports.keys = keys 