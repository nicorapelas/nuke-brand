const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDB, isDBConnected } = require('../config/database');

// Get cart
router.get('/', async (req, res) => {
  try {
    if (!isDBConnected()) {
      console.log('Database not connected, returning empty cart');
      return res.json([]);
    }
    const db = getDB();
    const cart = await db.collection('cart').find({}).toArray();
    res.json(cart);
  } catch (error) {
    console.error('Error fetching cart:', error.message);
    res.json([]); // Return empty cart if database is not available
  }
});

// Add item to cart
router.post('/add', async (req, res) => {
  try {
    const { productId, quantity = 1 } = req.body;
    
    if (!isDBConnected()) {
      console.log('Database not connected, cannot add to cart');
      return res.status(503).json({ error: 'Database not available' });
    }
    
    const db = getDB();
    
    // Get product details
    const product = await db.collection('products').findOne({ id: productId });
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Check if item already exists in cart
    const existingItem = await db.collection('cart').findOne({ productId });
    
    if (existingItem) {
      // Update quantity
      await db.collection('cart').updateOne(
        { productId },
        { $inc: { quantity: quantity } }
      );
    } else {
      // Add new item
      await db.collection('cart').insertOne({
        id: uuidv4(),
        productId,
        title: product.title,
        price: product.price,
        image: product.image,
        quantity
      });
    }

    // Return updated cart
    const updatedCart = await db.collection('cart').find({}).toArray();
    res.json({ success: true, cart: updatedCart });
  } catch (error) {
    console.error('Error adding to cart:', error.message);
    res.status(500).json({ error: 'Failed to add item to cart' });
  }
});

// Update cart item quantity
router.put('/:itemId', async (req, res) => {
  try {
    const { quantity } = req.body;
    
    if (!isDBConnected()) {
      console.log('Database not connected, cannot update cart');
      return res.status(503).json({ error: 'Database not available' });
    }
    
    const db = getDB();
    
    if (quantity <= 0) {
      // Remove item
      await db.collection('cart').deleteOne({ id: req.params.itemId });
    } else {
      // Update quantity
      await db.collection('cart').updateOne(
        { id: req.params.itemId },
        { $set: { quantity } }
      );
    }

    const updatedCart = await db.collection('cart').find({}).toArray();
    res.json({ success: true, cart: updatedCart });
  } catch (error) {
    console.error('Error updating cart item:', error.message);
    res.status(500).json({ error: 'Failed to update cart item' });
  }
});

// Remove item from cart
router.delete('/:itemId', async (req, res) => {
  try {
    if (!isDBConnected()) {
      console.log('Database not connected, cannot remove from cart');
      return res.status(503).json({ error: 'Database not available' });
    }
    
    const db = getDB();
    await db.collection('cart').deleteOne({ id: req.params.itemId });
    
    const updatedCart = await db.collection('cart').find({}).toArray();
    res.json({ success: true, cart: updatedCart });
  } catch (error) {
    console.error('Error removing from cart:', error.message);
    res.status(500).json({ error: 'Failed to remove item from cart' });
  }
});

// Clear cart
router.delete('/', async (req, res) => {
  try {
    if (!isDBConnected()) {
      console.log('Database not connected, cannot clear cart');
      return res.status(503).json({ error: 'Database not available' });
    }
    
    const db = getDB();
    await db.collection('cart').deleteMany({});
    res.json({ success: true, cart: [] });
  } catch (error) {
    console.error('Error clearing cart:', error.message);
    res.status(500).json({ error: 'Failed to clear cart' });
  }
});

module.exports = router;
