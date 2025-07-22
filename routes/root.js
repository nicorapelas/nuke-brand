const express = require('express')
const router = express.Router()

// Handle contact form submission
router.get('/', async (req, res) => {
  res.send('Hello World, NUKE server running...')
})

module.exports = router 