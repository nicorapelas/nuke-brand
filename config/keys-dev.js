const keys = {
  mongo: {
    url: function () {
      return 'mongodb+srv://nicorapelas:evFAfu7yojFR3qJE@cluster0.e1ji25n.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0'
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
    pass: 'NukeBrand@9375', 
  },
  payfast: {
    merchantId: '22937383', 
    merchantKey: 'pptn8pvrisnqg', 
    returnUrl: 'http://localhost:3000/payment/success',
    cancelUrl: 'http://localhost:3000/payment/cancel',
    notifyUrl: 'https://4d1507650a18.ngrok-free.app/api/payments/notify',
    passPhrase: 'griekseBoertjie007', 
    testMode: false,
    baseUrl: 'https://www.payfast.co.za/eng/process',
  },
  latestAppVersion: {
    v: '1.0.0',
  },
}

exports.keys = keys 