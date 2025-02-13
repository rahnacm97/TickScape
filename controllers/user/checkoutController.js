const User = require("../../models/userSchema");
const Category = require("../../models/categorySchema");
const Product = require("../../models/productSchema");
const Address = require("../../models/addressSchema");
const Cart = require("../../models/cartSchema");
const Order = require("../../models/orderSchema");
const env = require("dotenv").config();
const session = require("express-session");
const { v4: uuidv4 } = require('uuid');

const getCheckout = async (req, res) => {
    try {      
        const userId = req.session.user._id;
        const carts = await Cart.findOne({ userId }).populate("items.productId");
        const address = await Address.find({userId})
       
       // console.log("Adress",address);

        if (!carts) {
          return res.render("checkout-cart", { 
            carts: { items: [] , total : 0},
            total: 0,
            captureEvents: { items: [], total: 0 }, 
            user: req.session.user ,
            address:address,
          });
        }
    
        let total = 0;
        carts.items.forEach(item => {
          total += item.totalPrice;
        });
     
        
        res.render("checkout-cart", {
          carts,
          total,
          address : address,
          cart:carts.items,
          user: req.session.user
        });

      } catch (error) {
        console.error("Error loading checkout page:", error);
        res.status(500).send("An error occurred while loading the checkout page.");
      }
};

const placeOrder = async (req, res) => {
  try {
    const userId = req.session.user._id;
    console.log("User ID:", userId);
    console.log("Request Body:", req.body);

    const { orderedItems, discount, address, status, paymentMethod, shipping } = req.body;

    if (!Array.isArray(orderedItems) || orderedItems.length === 0) {
      return res.status(400).json({ error: "Ordered items are required" });
    }

    console.log("Ordered Items:", orderedItems);

    let totalPrice = orderedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    let finalAmount = totalPrice + shipping - (discount || 0);

    console.log("Total Price:", totalPrice);
    console.log("Final Amount:", finalAmount);

    let createdOrders = [];
    let previewOrder = [];
    let fullAddress = null;

    const parentOrderId = uuidv4(); 
    console.log("Generated Parent Order ID:", parentOrderId);

    if (address) {
      const addressDoc = await Address.findOne({ userId: userId });
      
      if (!addressDoc) {
        return res.status(404).json({ error: "Address document not found." });
      }

      fullAddress = addressDoc.address.find(addr => addr._id.toString() === address);

      if (!fullAddress) {
        return res.status(404).json({ error: "Address not found." });
      }
    }

    for (const item of orderedItems) {
      if (!item.product) {
        return res.status(400).json({ error: "Invalid item format: Missing product ID." });
      }

      const product = await Product.findById(item.product);
      if (!product) {
        return res.status(404).json({ error: `Product with ID ${item.product} not found.` });
      }

      if (product.quantity < item.quantity) {
        return res.status(400).json({ error: `Insufficient stock for product ${product.productName}.` });
      }

      await Product.findByIdAndUpdate(
        item.product,
        { $inc: { quantity: -item.quantity } },
        { new: true }
      );
      console.log(`Stock updated for product ID: ${item.product}`);

      const newOrder = new Order({
        parentOrderId,
        userId,
        productId: item.product,
        quantity: item.quantity,
        price: item.price,
        totalPrice: item.price * item.quantity,
        discount,
        shipping,
        finalAmount,
        address: fullAddress,
        status: status || "Order Placed",
        paymentMethod
      });

      await newOrder.save();

      previewOrder = orderedItems.map(item => ({
        product: item.product,
        quantity: item.quantity,
        price: item.price,
        totalPrice: item.price * item.quantity,
        discount: discount, 
        address: fullAddress,
        status: status,
        paymentMethod: paymentMethod,
        shipping: shipping 
    }));

      createdOrders.push(newOrder);

    }
    
    console.log("Full Address", fullAddress);

    let Price = orderedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    let grandAmount = Price + shipping - (discount || 0); 

    let previewOrderObject = {
      parentOrderId,
      previewOrder: previewOrder,
      discount: discount, 
      address: fullAddress,
      status: status || "Order Placed",
      paymentMethod: paymentMethod,
      shipping: shipping,
      grandTotal: grandAmount,
    };

    console.log(previewOrderObject);

    const cartDeleted = await Cart.findOneAndDelete({ userId });
    console.log(cartDeleted ? "Cart deleted successfully" : "No cart found for user");

    res.status(201).json({ success: true, message: "Order placed successfully", orders: previewOrderObject });

  } catch (error) {
    console.error("Order Error:", error);
    res.status(500).json({ error: "Order placement failed" });
  }
};


module.exports = {
    getCheckout,
    placeOrder,
}