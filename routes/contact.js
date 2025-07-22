const express = require('express')
const router = express.Router()
const { sendEmail } = require('../config/email')

// Handle contact form submission
router.post('/submit', async (req, res) => {
  try {
    const { name, email, subject, message } = req.body

    // Validate required fields
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ 
        success: false, 
        error: 'All fields are required', 
      })
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Please enter a valid email address', 
      })
    }

    // Send email
    const emailResult = await sendEmail({
      name,
      email,
      subject,
      message,
    })

    if (emailResult.success) {
      res.json({ 
        success: true, 
        message: 'Thank you for your message! We will get back to you soon.', 
      })
    } else {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to send email. Please try again later.', 
      })
    }
  } catch (error) {
    console.error('Contact form error:', error)
    res.status(500).json({ 
      success: false, 
      error: 'Server error. Please try again later.', 
    })
  }
})

module.exports = router 