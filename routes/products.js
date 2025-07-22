const express = require('express');
const router = express.Router();
const { getDB, isDBConnected } = require('../config/database');

// Sample products data for initial seeding
const sampleProducts = [
  {
    id: '1',
    handle: 'digital-watch',
    title: 'Nuke NG101 Digital Watch',
    price: 295,
    description: 'Built for tough jobs. Water resistant digital watch with durable polymer construction.',
    image: '/images/g7.png',
    specs: {
      waterResistance: '30m',
      material: 'Polymer',
      weight: '43g'
    }
  },
  {
    id: '2',
    handle: 'nuke-cgsr001-digital-watch',
    title: 'Nuke CGSR001 Digital Watch',
    price: 395,
    description: 'Professional grade digital watch with enhanced durability and precision.',
    image: '/images/g6.png',
    specs: {
      waterResistance: '50m',
      material: 'Polymer',
      weight: '47g'
    }
  },
  {
    id: '3',
    handle: 'box-of-10x-nuke-ng101-digital-watches',
    title: 'Box of 10x Nuke NG101 Digital Watches',
    price: 249.99,
    description: 'Bulk order of 10 Nuke NG101 Digital Watches. Perfect for teams and organizations.',
    image: '/images/g7.png',
    specs: {
      waterResistance: '30m',
      material: 'Polymer',
      weight: '43g'
    }
  },
  {
    id: '4',
    handle: 'box-of-10x-nuke-cgsr001-digital-watches',
    title: 'Box of 10x Nuke CGSR001 Digital Watches',
    price: 299.99,
    description: 'Bulk order of 10 Nuke CGSR001 Digital Watches. Professional grade for teams.',
    image: '/images/g6.png',
    specs: {
      waterResistance: '50m',
      material: 'Polymer',
      weight: '47g'
    }
  }
];

// Seed products if collection is empty
const seedProducts = async () => {
  try {
    if (!isDBConnected()) {
      console.log('Database not connected, skipping product seeding');
      return;
    }
    
    const db = getDB();
    const productsCollection = db.collection('products');
    
    const count = await productsCollection.countDocuments();
    console.log(`Found ${count} existing products in database`);
    
    if (count === 0) {
      console.log('No products found, seeding sample products...');
      const result = await productsCollection.insertMany(sampleProducts);
      console.log(`Products seeded successfully. Inserted ${result.insertedCount} products`);
      
      // Verify the products were inserted
      const verifyCount = await productsCollection.countDocuments();
      console.log(`Verified: ${verifyCount} products now in database`);
    } else {
      console.log('Products already exist in database, skipping seeding');
    }
  } catch (error) {
    console.error('Error seeding products:', error.message);
  }
};

// Test endpoint
router.get('/test', (req, res) => {
  console.log('Test endpoint hit');
  res.json({ message: 'Products API is working' });
});

// Get all products
router.get('/', async (req, res) => {
  console.log('GET /api/products - All products requested');
  try {
    if (!isDBConnected()) {
      console.log('Database not connected, returning sample products');
      return res.json(sampleProducts);
    }
    const db = getDB();
    const products = await db.collection('products').find({}).toArray();
    res.json(products);
  } catch (error) {
    console.error('Error fetching products:', error.message);
    // Return sample products if database is not available
    res.json(sampleProducts);
  }
});

// Get single product by handle
router.get('/:handle', async (req, res) => {
  console.log(`GET /api/products/${req.params.handle} - Product requested`);
  try {
    if (!isDBConnected()) {
      console.log('Database not connected, returning sample product');
      const product = sampleProducts.find(p => p.handle === req.params.handle);
      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }
      return res.json(product);
    }
    
    const db = getDB();
    const product = await db.collection('products').findOne({ handle: req.params.handle });
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(product);
  } catch (error) {
    console.error('Error fetching product:', error.message);
    // Return sample product if database is not available
    const product = sampleProducts.find(p => p.handle === req.params.handle);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(product);
  }
});

// Initialize products on module load
setTimeout(() => {
  console.log('Starting product seeding...');
  seedProducts();
}, 2000); // Wait 2 seconds for database connection to be fully established

// Manual seeding endpoint
router.post('/seed', async (req, res) => {
  try {
    await seedProducts();
    res.json({ success: true, message: 'Products seeded successfully' });
  } catch (error) {
    console.error('Error seeding products:', error.message);
    res.status(500).json({ error: 'Failed to seed products' });
  }
});

// Manual seeding endpoint (GET version for easy testing)
router.get('/seed', async (req, res) => {
  try {
    await seedProducts();
    res.json({ success: true, message: 'Products seeded successfully' });
  } catch (error) {
    console.error('Error seeding products:', error.message);
    res.status(500).json({ error: 'Failed to seed products' });
  }
});

module.exports = router;
