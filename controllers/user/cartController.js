const User = require("../../models/userSchema");
const Category = require("../../models/categorySchema");
const Product = require("../../models/productSchema");
const Address = require("../../models/addressSchema");
const Cart = require("../../models/cartSchema");
const Order = require("../../models/orderSchema");
const env = require("dotenv").config();
const session = require("express-session");

const getCartPage = async (req, res) => {
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

    if (!carts) {
      return res.render('cart', { carts: [], totalPrice: 0, cart: carts });
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
    res.status(500).send('An error occurred while loading the cart page.');
  }
};


const addToCart = async (req, res) => {
  try {
    const { productId } = req.body;
    const userId = req.session?.user?._id; 

    if (!userId) {
      return res.status(401).json({ error: "Please log in to add a product" });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
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

        if (existingProduct.quantity + 1 > 5) {
          return res.status(400).json({ status: false, message: "You cannot add more than 5 units of this product" });
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

    if (!productId || isNaN(parsedQuantity)) {
      return res.status(400).json({ error: "Product ID and valid quantity are required" });
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

    item.quantity = parsedQuantity;
    item.totalPrice = parsedQuantity * product.price;

    await cart.save();
    const cartitemcount = cart.items.reduce((total, item) => total + item.quantity, 0);

    res.status(200).json({
      newTotalPrice: item.totalPrice,quantity:item.quantity,
      cartitemcount,
    });
  } catch (error) {
    console.error("Error updating cart:", error);
    res.status(500).json({ error: "Failed to update cart", details: error.message });
  }
};

const deleteProduct = async (req, res) => {
  try {

    const user = req.session.user;
    // console.log("User",user)
    if (!user) {
      return res.status(401).json({ error: 'User not logged in' });
    }

    console.log("req",req.query);
    const productId  = req.query.id;
    if (!req.query.id) {
      return res.status(400).json({ error: "ID is required" });
    }
    console.log("productId",productId)
    let cart = await Cart.findOne({ userId: req.session.user._id });
    console.log("cart",cart)
    if (!cart) {
      return res.status(404).json({ error: 'Cart not found' });
    }

    const itemIndex = cart.items.findIndex((item) => item.productId.toString() === productId);
    console.log("Itemindex",itemIndex)
    if (itemIndex === -1) {
      return res.status(404).json({ error: 'Product not found in cart' });
    }

    const product = await Product.findById(productId);
    console.log("product",product)
    if (!product) {
      return res.status(404).json({ error: 'Product not found in inventory' });
    }

    const removedItem = cart.items[itemIndex];

    cart.items.splice(itemIndex, 1);

    await cart.save();
    await product.save();
    cart = await Cart.findOne({ userId:req.session.user._id })
    let cartitemcount = cart.items.length
    return res.redirect('/cart');
    res.status(200).json({ message: 'Product removed from cart',cartitemcount:cartitemcount });
  } catch (error) {
    console.error('Error removing product from cart:', error);
    res.status(500).json({ error: 'Failed to remove product from cart' });
  }
};

const getCheckout = async (req, res) => {
  try {
    res.render('checkout-cart');
  } catch (error) {
    res.redirect("/pageNotFound");
  }
};


module.exports = { 
  getCartPage,
  addToCart,
  changeQuantity,
  deleteProduct,
  getCheckout,
}
