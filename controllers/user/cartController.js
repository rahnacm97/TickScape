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

const getCartPage = async (req, res, next) => {
  try {
    if (!req.session.user) {
      return res.redirect('/login');
    }

    const userId = req.session.user;
    const currentPage = parseInt(req.query.page) || 1;
    const limit = 4;
    const skip = (currentPage - 1) * limit;

    const user = await User.findById({_id:userId});

    const carts = await Cart.findOne({ userId }).populate({
      path: "items.productId",
      populate: [{ path: "category", select: "name" }, { path: "brand", select: "brandName" }]
    });

    if (!carts || carts.items.length === 0) {
      return res.render('cart', { 
        carts: [], itemTotal: 0, gstAmount: 0, total: 0, 
        cart: null, user: user, data: [], 
        currentPage: 1, totalPages: 1 
      });
    }

    let itemTotal = 0;
    let gstAmount = 0;
    let totalAmount = 0;

    for (let item of carts.items) {
      if (item.productId) {
        const latestPrice = item.productId.salePrice;
        const gstRate = item.productId.gstRate / 100;

        item.totalPrice = item.quantity * latestPrice;

        const gstForItem = item.totalPrice * gstRate;

        item.totalPriceWithGST = item.totalPrice + gstForItem;

        itemTotal += item.totalPrice;
        gstAmount += gstForItem;
        totalAmount += item.totalPriceWithGST;
      }
    }

    await carts.save();

    res.render('cart', {
      user: user,
      data: carts.items.slice(skip, skip + limit),
      itemTotal: Math.round(itemTotal),
      gstAmount: parseFloat(gstAmount).toFixed(2),
      total: totalAmount.toFixed(2),
      cart: carts,
      currentPage: currentPage,
      totalPages: Math.ceil(carts.items.length / limit),
    });

  } catch (error) {
    console.error('Error fetching cart:', error);
    next(new CustomError(500, "An error occurred while loading the cart page."));
  }
};



const addToCart = async (req, res,next) => {
  try {
    const { productId } = req.body;
    const userId = req.session?.user; 

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
      return next(new CustomError(400, "This product is out of stock"))
    }

    let cart = await Cart.findOne({ userId });

    if(!cart){
       const newCart = new Cart({
        userId,
        items: [
          {
            productId,
            quantity: 1,
            totalPrice: product.salePrice,
          },
        ],
      });
      await newCart.save();
   return res.status(200).json({ status: true, message: "Product added to cart successfully!" });

    }

    if ( cart && cart.items.length === 0) {
     
      cart.items.push({
        productId,
              quantity: 1,
              totalPrice: product.salePrice,
      })
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
        existingProduct.totalPrice = existingProduct.quantity *  product.salePrice;

      } else {
        cart.items.push({
          productId,
          quantity: 1,
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

    const cart = await Cart.findOne({ userId: req.session.user });
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

      let cart = await Cart.findOne({ userId: req.session.user });
      if (!cart) {
          return res.status(404).json({ error: 'Cart not found' });
      }

      const itemIndex = cart.items.findIndex(item => item.productId.toString() === productId);
      if (itemIndex === -1) {
          return res.status(404).json({ error: 'Product not found in cart' });
      }
      
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
