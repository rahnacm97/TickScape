const User = require("../../models/userSchema");
const Category = require("../../models/categorySchema");
const Product = require("../../models/productSchema");
const Address = require("../../models/addressSchema");
const Cart = require("../../models/cartSchema");
const Order = require("../../models/orderSchema");
const CustomError = require('../../utils/customError');
const env = require("dotenv").config();
const session = require("express-session");
const { default: mongoose } = require("mongoose");

const getCartPage = async (req, res,next) => {
  try {
   
    if (!req.session.user) {
      return res.redirect('/login');
    }

    const userId = req.session.user._id;

    const currentPage = parseInt(req.query.page) || 1; 
    const limit = 4; 
    const skip = (currentPage - 1) * limit;

    const carts = await Cart.findOne({ userId }).populate({
      path: "items.productId",
      populate: [{ path: "category", select: "name" }, { path: "brand", select: "brandName" }]
    });

    if (!carts || carts.items.length === 0) {
      return res.render('cart', { carts: [], total: 0, cart: carts , user: req.session.user, data: [], cart: null, 
        currentPage: 1, 
        totalPages: 1});
    }

    const paginatedItems = carts.items.slice(skip, skip + limit);

    let totalamount = carts.items.reduce((sum, item) => sum + item.totalPrice, 0).toFixed(0);
    let total = Math.round(totalamount);

    const totalPages = Math.ceil(carts.items.length / limit);

    res.render('cart', {
      user: req.session.user,
      data: paginatedItems,
      total: total,
      cart: carts,
      currentPage: currentPage,
      totalPages: totalPages
    });

  } catch (error) {
    console.error('Error fetching cart:', error);
    //res.status(500).send('An error occurred while loading the cart page.');
    next(new CustomError(500, "An error occurred while loading the cart page."))
  }
};


const addToCart = async (req, res,next) => {
  try {
    const { productId } = req.body;
    const userId = req.session?.user?._id; 

    if (!userId) {
      //return res.status(401).json({ error: "Please log in to add a product" });
      return next(new CustomError(401, "Please log in to add a product"))
    }

    const product = await Product.findById(productId);
    if (!product) {
      //return res.status(404).json({ error: "Product not found" });
      return next(new CustomError(404, "Product not found"))
    }

    if (product.quantity === 0) {
      return res.status(400).json({ error: "This product is out of stock" });
    }

    let cart = await Cart.findOne({ userId });
    console.log("cart:",cart);
    if (!cart) {
      cart = new Cart({
        userId,
        items: [
          {
            productId,
            quantity: 1,
            price: product.salePrice,
            totalPrice: product.salePrice,
          },
        ],
      });
    } else {
      const existingProduct = cart.items.find(
        (item) => item.productId.toString() === productId
      );

      if (existingProduct) {
        if (existingProduct.quantity >= product.quantity) {
          return res.status(400).json({ status: false, message: `Only ${product.quantity} units are available` });
        }

        if (existingProduct.quantity + 1 > 3) {
          return res.status(400).json({ status: false, message: "You cannot add more than 3 units of this product" });
        }

        existingProduct.quantity += 1;
        existingProduct.totalPrice = existingProduct.quantity * existingProduct.price;

      } else {
        cart.items.push({
          productId,
          quantity: 1,
          price: product.salePrice,
          totalPrice: product.salePrice, 
        });
      }
    }

    await cart.save();
    console.log("Updated cart:", cart);
    res.status(200).json({ status: true, message: "Product added to cart successfully!", cart, cartItemCount: cart.items.length });
  } catch (error) {
    console.error("Error adding product to cart:", error);
    res.status(500).json({ error: "Failed to add product to cart. Please try again." });
  }
};

const changeQuantity = async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    const parsedQuantity = parseInt(quantity);

    if (!productId || isNaN(parsedQuantity) || parsedQuantity <= 0) {
      return res.status(400).json({ error: "Valid Product ID and quantity greater than 0 are required" });
    }

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ error: "Invalid Product ID" });
    }

    const cart = await Cart.findOne({ userId: req.session.user._id });
    if (!cart) {
      return res.status(404).json({ error: "Cart not found" });
    }

    const item = cart.items.find((item) => item.productId.toString() === productId);
    if (!item) {
      return res.status(404).json({ error: "Product not found in cart" });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ error: "Product not found in inventory" });
    }

    const price = product.salePrice || product.regularPrice;

    if (isNaN(price) || price <= 0) {
      return res.status(400).json({ error: "Invalid product price" });
    }

    item.quantity = parsedQuantity;
    item.totalPrice = parsedQuantity * price;

    if (isNaN(item.totalPrice) || item.totalPrice <= 0) {
      return res.status(400).json({ error: "Invalid total price for the item" });
    }

    await cart.save();

    // Calculate the grand total
    const grandTotal = cart.items.reduce((total, item) => total + item.totalPrice, 0);

    return res.status(200).json({
      message: "Cart updated successfully",
      updatedCart: cart,
      grandTotal: grandTotal,
    });
  } catch (error) {
    console.error("Error updating cart:", error);
    res.status(500).json({ error: "Failed to update cart", details: error.message });
  }
};

const deleteProduct = async (req, res) => {
  try {
      const user = req.session.user;
      if (!user) {
          return res.status(401).json({ error: 'User not logged in' });
      }

      const productId = req.query.id || req.body.id;
      if (!productId) {
          return res.status(400).json({ error: "ID is required" });
      }

      let cart = await Cart.findOne({ userId: req.session.user._id });
      if (!cart) {
          return res.status(404).json({ error: 'Cart not found' });
      }

      const itemIndex = cart.items.findIndex(item => item.productId.toString() === productId);
      if (itemIndex === -1) {
          return res.status(404).json({ error: 'Product not found in cart' });
      }

      // Remove the item from the cart
      cart.items.splice(itemIndex, 1);
      await cart.save();

      return res.status(200).json({ 
          message: 'Product removed from cart', 
          cartItemCount: cart.items.length 
      });

  } catch (error) {
      console.error('Error removing product from cart:', error);
      return res.status(500).json({ error: 'Failed to remove product from cart' });
  }
};


module.exports = { 
  getCartPage,
  addToCart,
  changeQuantity,
  deleteProduct,
}
