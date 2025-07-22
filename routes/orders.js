const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../config/database');

// Get all orders
router.get('/', async (req, res) => {
  try {
    const db = getDB();
    const orders = await db.collection('orders').find({}).toArray();
    res.json(orders);
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Create order
router.post('/', async (req, res) => {
  try {
    const { customerInfo, items, total } = req.body;
    const db = getDB();
    
    const order = {
      id: uuidv4(),
      customerInfo,
      items,
      total,
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    await db.collection('orders').insertOne(order);
    
    // Clear cart after order
    await db.collection('cart').deleteMany({});

    res.json({ success: true, order });
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

module.exports = router;
