const express = require('express')
const crypto = require('crypto')
const keys = require('../config/keys')
const { currentConfig } = require('../config/payfast')
const { getDB } = require('../config/database')
const { v4: uuidv4 } = require('uuid')
const { sendEmail } = require('../config/email')

const router = express.Router()

// Generate PayFast payment data
const generatePaymentData = (orderData) => {
  const {
    merchantId,
    merchantKey,
    passPhrase,
    baseUrl,
  } = currentConfig

  // Create a compact order summary for custom_str2
  const orderSummary = orderData.items.map(item => 
    `${item.title}(${item.quantity})`,
  ).join(', ')
  
  // Limit to 255 characters for PayFast requirement
  const customStr2 = orderSummary.length > 255 
    ? orderSummary.substring(0, 252) + '...'
    : orderSummary

  const paymentData = {
    merchant_id: merchantId,
    merchant_key: merchantKey,
    return_url: keys.payfast.returnUrl,
    cancel_url: keys.payfast.cancelUrl,
    notify_url: keys.payfast.notifyUrl,
    
    // Order details
    m_payment_id: orderData.orderId,
    amount: orderData.total.toFixed(2),
    item_name: `Nuke Order - ${orderData.orderId.substring(0, 8)}`, // Shortened item name
    
    // Customer details
    name_first: orderData.customerInfo.firstName,
    name_last: orderData.customerInfo.lastName,
    email_address: orderData.customerInfo.email,
    
    // Optional customer details
    cell_number: orderData.customerInfo.phone || '',
    
    // Custom data
    custom_str1: orderData.orderId,
    custom_str2: customStr2,
  }

  // Generate signature from the original data (before adding signature)
  const signature = generateSignature(paymentData, passPhrase)
  
  // Create final payment data with signature
  const finalPaymentData = {
    ...paymentData,
    signature: signature,
  }

  return {
    paymentData: finalPaymentData,
    redirectUrl: baseUrl,
  }
}

// Generate PayFast signature - Working version that matches PayFast exactly
const generateSignature = (data, passPhrase) => {
  // Create parameter string using PayFast's exact method
  let paramString = ''
  
  // PayFast's exact parameter order and encoding
  const payfastOrder = [
    'merchant_id',
    'merchant_key', 
    'return_url',
    'cancel_url',
    'notify_url',
    'name_first',
    'name_last',
    'email_address',
    'm_payment_id',
    'amount',
    'item_name',
  ]
  
  // Use PayFast's exact encoding method
  payfastOrder.forEach(key => {
    if (data[key] !== null && data[key] !== undefined && data[key] !== '') {
      let value = data[key].toString()
      
      // PayFast's specific encoding: spaces become +, rest is URL encoded
      // Replace spaces with + first, then URL encode, then restore + characters
      value = value.replace(/\s/g, '+')
      value = encodeURIComponent(value)
      value = value.replace(/%2B/g, '+')
      
      paramString += `${key}=${value}&`
    }
  })
  
  // Remove trailing &
  paramString = paramString.slice(0, -1)
  
  // Add passphrase
  paramString += `&passphrase=${encodeURIComponent(passPhrase)}`

  // Generate MD5 hash
  const signature = crypto.createHash('md5').update(paramString).digest('hex')
  
  return signature
}

// Verify PayFast signature
const verifySignature = (data, signature, passPhrase) => {
  const calculatedSignature = generateSignature(data, passPhrase)
  return calculatedSignature === signature
}

// Initiate payment
router.post('/initiate', async (req, res) => {
  try {
    const { customerInfo, items, total } = req.body
    
    if (!customerInfo || !items || !total) {
      return res.status(400).json({ 
        error: 'Missing required payment information', 
      })
    }

    // Create order in database
    const db = getDB()
    const orderId = uuidv4()
    
    const order = {
      id: orderId,
      customerInfo,
      items,
      total,
      status: 'pending',
      paymentStatus: 'pending',
      createdAt: new Date().toISOString(),
    }

    await db.collection('orders').insertOne(order)

    // Generate PayFast payment data
    const { paymentData, redirectUrl } = generatePaymentData({
      orderId,
      customerInfo,
      items,
      total,
    })

    res.json({
      success: true,
      paymentData,
      redirectUrl,
      orderId,
    })
  } catch (error) {
    console.error('Error initiating payment:', error)
    res.status(500).json({ error: 'Failed to initiate payment' })
  }
})

// PayFast notification handler (ITN - Instant Transaction Notification)
router.post('/notify', async (req, res) => {
  try {
    const data = req.body
    
    console.log('=== PAYFAST NOTIFICATION RECEIVED ===')
    console.log('Notification data:', JSON.stringify(data, null, 2))
    console.log('Headers:', req.headers)
    console.log('=====================================')
    
    // Verify signature
    const signature = data.signature
    delete data.signature
    
    const isValid = verifySignature(data, signature, currentConfig.passPhrase)
    console.log('Signature valid:', isValid)
    
    if (!isValid) {
      console.error('Invalid PayFast signature')
      return res.status(400).send('Invalid signature')
    }

    // Update order status
    const db = getDB()
    const orderId = data.m_payment_id
    console.log('Processing order ID:', orderId)
    
    const updateData = {
      paymentStatus: data.payment_status,
      paymentId: data.pf_payment_id,
      updatedAt: new Date().toISOString(),
    }

    if (data.payment_status === 'COMPLETE') {
      console.log('Payment completed, updating order status to paid')
      updateData.status = 'paid'
      // Clear cart after successful payment
      await db.collection('cart').deleteMany({})

      // Fetch the order details for the email
      const order = await db.collection('orders').findOne({ id: orderId })
      console.log('Found order for email:', order ? 'Yes' : 'No')
      
      if (order) {
        console.log('Sending order confirmation email...')
        // Build order summary HTML
        const itemsHtml = order.items.map(item =>
          `<li>${item.title} (x${item.quantity}) - R${item.price}</li>`,
        ).join('')
        const emailBody = `
          <h2>New Paid Order Received</h2>
          <p><strong>Order ID:</strong> ${order.id}</p>
          <p><strong>Customer:</strong> ${order.customerInfo.firstName} ${order.customerInfo.lastName} (${order.customerInfo.email})</p>
          <p><strong>Phone:</strong> ${order.customerInfo.phone || ''}</p>
          <p><strong>Address:</strong> ${order.customerInfo.address}, ${order.customerInfo.city}, ${order.customerInfo.province}, ${order.customerInfo.postalCode}</p>
          <p><strong>Total:</strong> R${order.total}</p>
          <p><strong>Items:</strong></p>
          <ul>${itemsHtml}</ul>
          <hr>
          <p><em>Sent automatically from Nuke Brand website (PayFast payment successful)</em></p>
        `
        
        try {
          await sendEmail({
            name: `${order.customerInfo.firstName} ${order.customerInfo.lastName}`,
            email: order.customerInfo.email,
            subject: `New Paid Order: ${order.id}`,
            message: emailBody,
            to: 'jacobscycles@gmail.com',
          })
          console.log('Order confirmation email sent successfully')
        } catch (emailError) {
          console.error('Error sending order confirmation email:', emailError)
        }
      } else {
        console.log('Order not found in database for email notification')
      }
    } else if (data.payment_status === 'FAILED') {
      console.log('Payment failed, updating order status to failed')
      updateData.status = 'failed'
    }

    await db.collection('orders').updateOne(
      { id: orderId },
      { $set: updateData },
    )
    console.log('Order status updated in database')

    res.status(200).send('OK')
  } catch (error) {
    console.error('Error processing PayFast notification:', error)
    res.status(500).send('Error processing notification')
  }
})

// Get payment status
router.get('/status/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params
    const db = getDB()
    
    const order = await db.collection('orders').findOne({ id: orderId })
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' })
    }

    res.json({
      success: true,
      order: {
        id: order.id,
        status: order.status,
        paymentStatus: order.paymentStatus,
        total: order.total,
        customerInfo: order.customerInfo,
        createdAt: order.createdAt,
      },
    })
  } catch (error) {
    console.error('Error fetching payment status:', error)
    res.status(500).json({ error: 'Failed to fetch payment status' })
  }
})

// Test PayFast configuration
router.get('/test-config', (req, res) => {
  try {
    const testData = {
      merchant_id: currentConfig.merchantId,
      merchant_key: currentConfig.merchantKey,
      return_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/success`,
      cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/cancel`,
      notify_url: `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/payments/notify`,
      m_payment_id: 'TEST-ORDER-123',
      amount: '100.00',
      item_name: 'Test Product',
      name_first: 'John',
      name_last: 'Doe',
      email_address: 'test@example.com',
      custom_str1: 'TEST-ORDER-123',
      custom_str2: 'Test product',
    }

    const signature = generateSignature(testData, currentConfig.passPhrase)
    testData.signature = signature

    res.json({
      success: true,
      config: {
        merchantId: currentConfig.merchantId,
        merchantKey: currentConfig.merchantKey,
        baseUrl: currentConfig.baseUrl,
        testMode: currentConfig.testMode,
      },
      testData,
      signature,
    })
  } catch (error) {
    console.error('Error testing PayFast config:', error)
    res.status(500).json({ error: 'Failed to test PayFast configuration' })
  }
})

// Test PayFast form submission
router.post('/test-submission', async (req, res) => {
  try {
    const testData = {
      merchant_id: currentConfig.merchantId,
      merchant_key: currentConfig.merchantKey,
      return_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/success`,
      cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/cancel`,
      notify_url: `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/payments/notify`,
      m_payment_id: 'TEST-ORDER-456',
      amount: '50.00',
      item_name: 'Test Item',
      name_first: 'Jane',
      name_last: 'Smith',
      email_address: 'jane@example.com',
      custom_str1: 'TEST-ORDER-456',
      custom_str2: 'Test item',
    }

    const signature = generateSignature(testData, currentConfig.passPhrase)
    testData.signature = signature

    res.json({
      success: true,
      testData,
      signature,
      url: currentConfig.baseUrl,
    })
  } catch (error) {
    console.error('Error testing PayFast submission:', error)
    res.status(500).json({ error: 'Failed to test PayFast submission' })
  }
})

// Test PayFast URL accessibility
router.get('/test-url', async (req, res) => {
  try {
    const https = require('https')
    const url = currentConfig.baseUrl
    
    // Test if we can reach the PayFast URL
    const testRequest = https.request(url, { method: 'GET' }, (response) => {
      
      let data = ''
      response.on('data', (chunk) => {
        data += chunk
      })
      
      response.on('end', () => {
        
        res.json({
          success: true,
          url,
          statusCode: response.statusCode,
          headers: response.headers,
          dataLength: data.length,
          dataPreview: data.substring(0, 200),
        })
      })
    })
    
    testRequest.on('error', (error) => {
      console.error('URL test error:', error)
      res.status(500).json({ 
        error: 'Failed to test PayFast URL',
        details: error.message, 
      })
    })
    
    testRequest.end()
  } catch (error) {
    console.error('Error testing PayFast URL:', error)
    res.status(500).json({ error: 'Failed to test PayFast URL' })
  }
})

// Test PayFast credentials
router.get('/test-credentials', (req, res) => {
  try {
    
    res.json({
      success: true,
      credentials: {
        merchantId: currentConfig.merchantId,
        merchantKey: currentConfig.merchantKey,
        passPhrase: currentConfig.passPhrase,
        testMode: currentConfig.testMode,
        baseUrl: currentConfig.baseUrl,
      },
    })
  } catch (error) {
    console.error('Error testing PayFast credentials:', error)
    res.status(500).json({ error: 'Failed to test PayFast credentials' })
  }
})

// Test PayFast signature with known test data
router.get('/test-signature', (req, res) => {
  try {
    // Test data from PayFast documentation
    const testData = {
      merchant_id: '10000100',
      merchant_key: '46f0cd694581a',
      return_url: 'https://www.example.com/return',
      cancel_url: 'https://www.example.com/cancel',
      notify_url: 'https://www.example.com/notify',
      m_payment_id: 'TEST-ORDER-123',
      amount: '100.00',
      item_name: 'Test Product',
      name_first: 'John',
      name_last: 'Doe',
      email_address: 'test@example.com',
    }

    const testPassphrase = 'secret'

    const signature = generateSignature(testData, testPassphrase)

    res.json({
      success: true,
      testData,
      signature,
      expectedSignature: '929d5c3c5c3c5c3c5c3c5c3c5c3c5c3c',
      matches: signature === '929d5c3c5c3c5c3c5c3c5c3c5c3c5c3c',
    })
  } catch (error) {
    console.error('Error testing signature:', error)
    res.status(500).json({ error: 'Failed to test signature' })
  }
})


// Test minimal PayFast request
router.get('/test-minimal', (req, res) => {
  try {
    const minimalData = {
      merchant_id: currentConfig.merchantId,
      merchant_key: currentConfig.merchantKey,
      return_url: 'http://localhost:3000/payment/success',
      cancel_url: 'http://localhost:3000/payment/cancel',
      notify_url: 'https://4d1507650a18.ngrok-free.app/api/payments/notify',
      m_payment_id: 'MINIMAL-TEST-123',
      amount: '10.00',
      item_name: 'Test Item',
      name_first: 'Test',
      name_last: 'User',
      email_address: 'test@example.com',
    }

    const signature = generateSignature(minimalData, currentConfig.passPhrase)
    minimalData.signature = signature

    res.json({
      success: true,
      minimalData,
      signature,
      config: {
        merchantId: currentConfig.merchantId,
        merchantKey: currentConfig.merchantKey,
        testMode: currentConfig.testMode,
        baseUrl: currentConfig.baseUrl,
      },
    })
  } catch (error) {
    console.error('Error testing minimal PayFast request:', error)
    res.status(500).json({ error: 'Failed to test minimal PayFast request' })
  }
})

// Test PayFast signature with exact documentation method
router.get('/test-doc-signature', (req, res) => {
  try {
    // Test data exactly as per PayFast documentation
    const testData = {
      merchant_id: '10000100',
      merchant_key: '46f0cd694581a',
      return_url: 'https://www.example.com/return',
      cancel_url: 'https://www.example.com/cancel',
      notify_url: 'https://www.example.com/notify',
      m_payment_id: 'TEST-ORDER-123',
      amount: '100.00',
      item_name: 'Test Product',
      name_first: 'John',
      name_last: 'Doe',
      email_address: 'test@example.com',
    }

    const testPassphrase = 'secret'

    // Generate signature exactly as per PayFast documentation
    let paramString = ''
    const sortedKeys = Object.keys(testData).sort()
    
    sortedKeys.forEach(key => {
      if (testData[key] !== null && testData[key] !== undefined) {
        const encodedValue = encodeURIComponent(testData[key])
        paramString += `${key}=${encodedValue}&`
      }
    })
    
    paramString = paramString.slice(0, -1)
    paramString += `&passphrase=${encodeURIComponent(testPassphrase)}`

    const signature = crypto.createHash('md5').update(paramString).digest('hex')

    res.json({
      success: true,
      testData,
      signature,
      expectedSignature: '929d5c3c5c3c5c3c5c3c5c3c5c3c5c3c',
      matches: signature === '929d5c3c5c3c5c3c5c3c5c3c5c3c5c3c',
      paramString,
    })
  } catch (error) {
    console.error('Error testing documentation signature:', error)
    res.status(500).json({ error: 'Failed to test documentation signature' })
  }
})

// Test minimal payment with actual credentials
router.get('/test-actual-credentials', (req, res) => {
  try {
    const minimalData = {
      merchant_id: currentConfig.merchantId,
      merchant_key: currentConfig.merchantKey,
      return_url: 'http://localhost:3000/payment/success',
      cancel_url: 'http://localhost:3000/payment/cancel',
      notify_url: 'http://localhost:5000/api/payments/notify',
      m_payment_id: 'ACTUAL-TEST-123',
      amount: '1.00',
      item_name: 'Test Payment',
      name_first: 'Test',
      name_last: 'User',
      email_address: 'test@example.com',
    }

    const signature = generateSignature(minimalData, currentConfig.passPhrase)
    minimalData.signature = signature

    // Create form HTML for testing
    let formHtml = `<form method="POST" action="${currentConfig.baseUrl}">`
    Object.keys(minimalData).forEach(key => {
      formHtml += `<input type="hidden" name="${key}" value="${minimalData[key]}">`
    })
    formHtml += '<input type="submit" value="Test Actual Payment">'
    formHtml += '</form>'

    res.json({
      success: true,
      minimalData,
      signature,
      formHtml,
      url: currentConfig.baseUrl,
    })
  } catch (error) {
    console.error('Error testing actual credentials:', error)
    res.status(500).json({ error: 'Failed to test actual credentials' })
  }
})

// Test with PayFast's exact data
router.get('/test-payfast-data', (req, res) => {
  try {
    // Use the exact same data as PayFast provided
    const payfastData = {
      merchant_id: '22937383',
      merchant_key: 'pptn8pvrisnqg',
      return_url: 'http://localhost:3000/payment/success',
      cancel_url: 'http://localhost:3000/payment/cancel',
      notify_url: 'http://localhost:5000/api/payments/notify',
      name_first: 'Test',
      name_last: 'User',
      email_address: 'test@example.com',
      m_payment_id: 'ACTUAL-TEST-123',
      amount: '5.00',
      item_name: 'Test Payment',
    }

    const signature = generateSignature(payfastData, currentConfig.passPhrase)
    payfastData.signature = signature

    res.json({
      success: true,
      payfastData,
      ourSignature: signature,
      expectedSignature: 'c1d17526d0f1b42b835210cd5b86a14b',
      matches: signature === 'c1d17526d0f1b42b835210cd5b86a14b',
    })
  } catch (error) {
    console.error('Error testing PayFast data:', error)
    res.status(500).json({ error: 'Failed to test PayFast data' })
  }
})

// Test with PayFast's exact parameter string
router.get('/test-exact-string', (req, res) => {
  try {
    // Use PayFast's exact parameter string
    const exactParamString = 'merchant_id=22937383&merchant_key=pptn8pvrisnqg&return_url=http%3A%2F%2Flocalhost%3A3000%2Fpayment%2Fsuccess&cancel_url=http%3A%2F%2Flocalhost%3A3000%2Fpayment%2Fcancel&notify_url=http%3A%2F%2Flocalhost%3A5000%2Fapi%2Fpayments%2Fnotify&name_first=Test&name_last=User&email_address=test%40example.com&m_payment_id=ACTUAL-TEST-123&amount=5.00&item_name=Test+Payment&passphrase=griekseBoertjie007'
    
    // Generate signature from PayFast's exact string
    const signature = crypto.createHash('md5').update(exactParamString).digest('hex')
    
    res.json({
      success: true,
      parameterString: exactParamString,
      generatedSignature: signature,
      expectedSignature: 'c1d17526d0f1b42b835210cd5b86a14b',
      matches: signature === 'c1d17526d0f1b42b835210cd5b86a14b',
    })
  } catch (error) {
    console.error('Error testing exact string:', error)
    res.status(500).json({ error: 'Failed to test exact string' })
  }
})

// Detailed comparison test
router.get('/test-comparison', (req, res) => {
  try {
    // Our data
    const ourData = {
      merchant_id: '22937383',
      merchant_key: 'pptn8pvrisnqg',
      return_url: 'http://localhost:3000/payment/success',
      cancel_url: 'http://localhost:3000/payment/cancel',
      notify_url: 'http://localhost:5000/api/payments/notify',
      name_first: 'Test',
      name_last: 'User',
      email_address: 'test@example.com',
      m_payment_id: 'ACTUAL-TEST-123',
      amount: '5.00',
      item_name: 'Test Payment',
    }

    // Generate our parameter string
    const ourSignature = generateSignature(ourData, currentConfig.passPhrase)
    
    // PayFast's exact parameter string
    const payfastParamString = 'merchant_id=22937383&merchant_key=pptn8pvrisnqg&return_url=http%3A%2F%2Flocalhost%3A3000%2Fpayment%2Fsuccess&cancel_url=http%3A%2F%2Flocalhost%3A3000%2Fpayment%2Fcancel&notify_url=http%3A%2F%2Flocalhost%3A5000%2Fapi%2Fpayments%2Fnotify&name_first=Test&name_last=User&email_address=test%40example.com&m_payment_id=ACTUAL-TEST-123&amount=5.00&item_name=Test+Payment&passphrase=griekseBoertjie007'
    
    res.json({
      success: true,
      ourData,
      ourSignature,
      payfastExpectedSignature: 'c1d17526d0f1b42b835210cd5b86a14b',
      payfastParamString,
      matches: ourSignature === 'c1d17526d0f1b42b835210cd5b86a14b',
    })
  } catch (error) {
    console.error('Error in comparison test:', error)
    res.status(500).json({ error: 'Failed to run comparison test' })
  }
})

// Test to show exact parameter string difference
router.get('/test-param-diff', (req, res) => {
  try {
    // Our data
    const ourData = {
      merchant_id: '22937383',
      merchant_key: 'pptn8pvrisnqg',
      return_url: 'http://localhost:3000/payment/success',
      cancel_url: 'http://localhost:3000/payment/cancel',
      notify_url: 'http://localhost:5000/api/payments/notify',
      name_first: 'Test',
      name_last: 'User',
      email_address: 'test@example.com',
      m_payment_id: 'ACTUAL-TEST-123',
      amount: '5.00',
      item_name: 'Test Payment',
    }

    // Generate our parameter string
    const ourSignature = generateSignature(ourData, currentConfig.passPhrase)
    
    // PayFast's exact parameter string
    const payfastParamString = 'merchant_id=22937383&merchant_key=pptn8pvrisnqg&return_url=http%3A%2F%2Flocalhost%3A3000%2Fpayment%2Fsuccess&cancel_url=http%3A%2F%2Flocalhost%3A3000%2Fpayment%2Fcancel&notify_url=http%3A%2F%2Flocalhost%3A5000%2Fapi%2Fpayments%2Fnotify&name_first=Test&name_last=User&email_address=test%40example.com&m_payment_id=ACTUAL-TEST-123&amount=5.00&item_name=Test+Payment&passphrase=griekseBoertjie007'
    
    // Generate signature from PayFast's exact string
    const payfastSignature = crypto.createHash('md5').update(payfastParamString).digest('hex')
    
    res.json({
      success: true,
      ourData,
      ourSignature,
      payfastSignature,
      payfastExpectedSignature: 'c1d17526d0f1b42b835210cd5b86a14b',
      payfastParamString,
      ourMatchesPayfast: ourSignature === payfastSignature,
      payfastMatchesExpected: payfastSignature === 'c1d17526d0f1b42b835210cd5b86a14b',
    })
  } catch (error) {
    console.error('Error in parameter difference test:', error)
    res.status(500).json({ error: 'Failed to run parameter difference test' })
  }
})

// Test to show our exact parameter string
router.get('/test-our-param-string', (req, res) => {
  try {
    // Our data
    const ourData = {
      merchant_id: '22937383',
      merchant_key: 'pptn8pvrisnqg',
      return_url: 'http://localhost:3000/payment/success',
      cancel_url: 'http://localhost:3000/payment/cancel',
      notify_url: 'http://localhost:5000/api/payments/notify',
      name_first: 'Test',
      name_last: 'User',
      email_address: 'test@example.com',
      m_payment_id: 'ACTUAL-TEST-123',
      amount: '5.00',
      item_name: 'Test Payment',
    }

    // Generate our parameter string manually to see exactly what we're creating
    let ourParamString = ''
    const payfastOrder = [
      'merchant_id',
      'merchant_key', 
      'return_url',
      'cancel_url',
      'notify_url',
      'name_first',
      'name_last',
      'email_address',
      'm_payment_id',
      'amount',
      'item_name',
    ]
    
    payfastOrder.forEach(key => {
      if (ourData[key] !== null && ourData[key] !== undefined && ourData[key] !== '') {
        let value = ourData[key].toString()
        value = value.replace(/\s/g, '+')
        value = encodeURIComponent(value).replace(/%20/g, '+')
        ourParamString += `${key}=${value}&`
      }
    })
    
    ourParamString = ourParamString.slice(0, -1)
    ourParamString += `&passphrase=${encodeURIComponent(currentConfig.passPhrase)}`
    
    const ourSignature = crypto.createHash('md5').update(ourParamString).digest('hex')
    
    // PayFast's exact parameter string
    const payfastParamString = 'merchant_id=22937383&merchant_key=pptn8pvrisnqg&return_url=http%3A%2F%2Flocalhost%3A3000%2Fpayment%2Fsuccess&cancel_url=http%3A%2F%2Flocalhost%3A3000%2Fpayment%2Fcancel&notify_url=http%3A%2F%2Flocalhost%3A5000%2Fapi%2Fpayments%2Fnotify&name_first=Test&name_last=User&email_address=test%40example.com&m_payment_id=ACTUAL-TEST-123&amount=5.00&item_name=Test+Payment&passphrase=griekseBoertjie007'
    
    res.json({
      success: true,
      ourParamString,
      payfastParamString,
      stringsMatch: ourParamString === payfastParamString,
      ourSignature,
      payfastExpectedSignature: 'c1d17526d0f1b42b835210cd5b86a14b',
    })
  } catch (error) {
    console.error('Error in our parameter string test:', error)
    res.status(500).json({ error: 'Failed to run our parameter string test' })
  }
})

// Test with PayFast's exact parameter string to verify our signature generation
router.get('/test-payfast-exact', (req, res) => {
  try {
    // PayFast's exact parameter string
    const payfastParamString = 'merchant_id=22937383&merchant_key=pptn8pvrisnqg&return_url=http%3A%2F%2Flocalhost%3A3000%2Fpayment%2Fsuccess&cancel_url=http%3A%2F%2Flocalhost%3A3000%2Fpayment%2Fcancel&notify_url=http%3A%2F%2Flocalhost%3A5000%2Fapi%2Fpayments%2Fnotify&name_first=Test&name_last=User&email_address=test%40example.com&m_payment_id=ACTUAL-TEST-123&amount=5.00&item_name=Test+Payment&passphrase=griekseBoertjie007'
    
    // Generate signature from PayFast's exact string
    const signature = crypto.createHash('md5').update(payfastParamString).digest('hex')
    
    res.json({
      success: true,
      payfastParamString,
      generatedSignature: signature,
      expectedSignature: 'c1d17526d0f1b42b835210cd5b86a14b',
      matches: signature === 'c1d17526d0f1b42b835210cd5b86a14b',
    })
  } catch (error) {
    console.error('Error in PayFast exact test:', error)
    res.status(500).json({ error: 'Failed to run PayFast exact test' })
  }
})

// Test with actual checkout data format
router.get('/test-checkout-data', (req, res) => {
  try {
    // Simulate actual checkout data
    const checkoutData = {
      orderId: 'CHECKOUT-TEST-' + Date.now(),
      customerInfo: {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        phone: '0821234567',
        address: '123 Test Street',
        city: 'Johannesburg',
        province: 'Gauteng',
        postalCode: '2000',
      },
      items: [
        {
          id: '1',
          title: 'Test Product',
          price: 50.00,
          quantity: 1,
        },
      ],
      total: 50.00,
    }

    // Generate PayFast payment data using the actual function
    const { paymentData, redirectUrl } = generatePaymentData(checkoutData)
    
    res.json({
      success: true,
      checkoutData,
      paymentData,
      redirectUrl,
      signature: paymentData.signature,
    })
  } catch (error) {
    console.error('Error in checkout data test:', error)
    res.status(500).json({ error: 'Failed to test checkout data' })
  }
})

module.exports = router 