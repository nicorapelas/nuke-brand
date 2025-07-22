const express = require('express')
const cors = require('cors')
const bodyParser = require('body-parser')
const path = require('path')
const { productsRouter, cartRouter, ordersRouter, contactRouter, paymentsRouter } = require('./routes')
const { connectDB } = require('./config/database')

const app = express()
const PORT = process.env.PORT || 5000

// Connect to MongoDB (non-blocking)
connectDB().catch(console.error)

// Middleware
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true,
}))
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))

// Serve static files from the React app
app.use(express.static(path.join(__dirname, '../web/build')))

// API Routes
app.use('/api/products', productsRouter)
app.use('/api/cart', cartRouter)
app.use('/api/orders', ordersRouter)
app.use('/api/contact', contactRouter)
app.use('/api/payments', paymentsRouter)

// Serve React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../web/build', 'index.html'))
})

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`)
}) 