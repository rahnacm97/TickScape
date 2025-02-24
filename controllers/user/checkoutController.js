const User = require("../../models/userSchema");
const Category = require("../../models/categorySchema");
const Product = require("../../models/productSchema");
const Address = require("../../models/addressSchema");
const Cart = require("../../models/cartSchema");
const Order = require("../../models/orderSchema");
const Coupon = require("../../models/couponSchema");
const env = require("dotenv").config();
const session = require("express-session");
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');


const getCheckout = async (req, res) => {
  try {
    const userId = req.session.user?._id;
    console.log("User ID:", userId);
    if (!userId) {
      return res.status(401).json({ success: false, message: "User not logged in" });
    }
    const carts = await Cart.findOne({ userId }).populate("items.productId");
    const address = await Address.find({ userId });

    console.log("Address:", address);

    if (!carts || carts.items.length === 0) {
      req.session.appliedCoupon = null;
      req.session.save(); 

      return res.render("checkout-cart", {
        carts: { items: [], total: 0 },
        total: 0,
        user: req.session.user,
        address,
        coupons: [],
        appliedCoupon: null,
        couponDiscount: 0,
        finalTotal: 0,
        couponSuccess: null,
        couponError: "Cart is empty.",
      });
    }

    let total = carts.items.reduce((acc, item) => acc + item.totalPrice, 0);
    const today = new Date();
    const coupons = await Coupon.find({
      isList: true,
      expireOn: { $gte: today },
      userId: { $nin: [userId] }, 
      name: { $ne: req.session.appliedCoupon?.name }
    });


    let couponDiscount = 0;
    let appliedCoupon = req.session.appliedCoupon; 

    if (appliedCoupon) {
      if (total >= appliedCoupon.discount) {
        couponDiscount = appliedCoupon.discount;
      } else {
        req.session.appliedCoupon = null;
        req.session.save(); 
      }
    }

    // const filteredCoupons = appliedCoupon 
    // ? coupons.filter(coupon => coupon.name !== appliedCoupon.name) 
    // : coupons;

    couponDiscount = Math.min(couponDiscount, total);
    let finalTotal = total - couponDiscount;
   
    req.session.couponDiscount = couponDiscount;
    req.session.save();

    res.render("checkout-cart", {
      carts,
      total,
      address,
      cart: carts.items,
      user: req.session.user,
      coupons,
      appliedCoupon: req.session.appliedCoupon || null,
      discount: couponDiscount,
      finalTotal,
      couponSuccess: req.session.couponSuccess || null,
      couponError: req.session.couponError || null,
    });

    console.log("Applied Coupon in Session:", req.session.appliedCoupon);
    console.log("Total:", total);
    console.log("Discount Applied:", couponDiscount);
    console.log("Final Total:", finalTotal);

  } catch (error) {
    console.error("Error loading checkout page:", error);
    res.status(500).send("An error occurred while loading the checkout page.");
  }
};

const applyCoupon = async (req, res) => {
  try {
    console.log("Coupon request received:", req.body);
    const { couponCode, carts } = req.body;

    const userId = req.session.user?._id; 
    console.log("User ID:", userId);

    if (!userId) {
      return res.status(401).json({ success: false, message: "User not logged in" });
    }

    if (!couponCode) {
      return res.json({ success: false, message: "Coupon code is required" });
    }

    if (!Array.isArray(carts) || carts.length === 0) {
      return res.json({ success: false, message: "Cart is empty" });
    }

    const productIds = carts.map(item => item.productId).filter(Boolean);
    if (productIds.length === 0) {
      return res.json({ success: false, message: "No valid products in cart" });
    }

    const subTotal = carts.reduce((acc, item) => acc + (item.price * (item.quantity ?? 1)), 0);
    console.log("Subtotal:", subTotal);

    const coupon = await Coupon.findOne({ name: couponCode }).lean();
    if (!coupon) {
      return res.json({ success: false, message: "Invalid coupon" });
    }

    const today = new Date();
    if (today < new Date(coupon.createdOn) || today > new Date(coupon.expireOn)) {
      return res.json({ success: false, message: "Coupon expired or not valid yet" });
    }

    if (subTotal < coupon.minimumPrice) {
      return res.json({ success: false, message: `Minimum purchase should be ₹${coupon.minimumPrice}` });
    }

    const couponDiscount = coupon.offerPrice;
    const finalTotal = Math.max(subTotal - couponDiscount, 0);

    req.session.appliedCoupon = {
      name: coupon.name,
      discount: couponDiscount,
    };
    if (!req.session.cart) {
      req.session.cart = {};
  }

    console.log("Final total after discount:", finalTotal);
    console.log("Applied coupon in session:", req.session.appliedCoupon);

    req.session.cart.subTotal = subTotal;
    req.session.cart.finalTotal = finalTotal;

    await Coupon.updateOne({ _id: coupon._id }, { $push: { userId } });

    req.session.save();

    return res.json({
      success: true,
      message: "Coupon Applied Successfully!",
      subTotal,
      finalTotal,
      couponDiscount,
      appliedCoupon: req.session.appliedCoupon
    });

  } catch (error) {
    console.error("Error applying coupon:", error);
    return res.status(500).json({ success: false, message: "Something went wrong" });
  }
};

const removeCoupon = async (req, res) => {
  try {

    const userId = req.session.user?._id;

    if (!userId) {
      return res.status(401).json({ success: false, message: "User not logged in" });
    }

      if (!req.session.appliedCoupon) {
          return res.json({ success: false, message: "No coupon applied" });
      }

      console.log("Before removing:", req.session.appliedCoupon);

      const discount = req.session.appliedCoupon.discount || 0; 
      req.session.appliedCoupon = null; 

      if (!req.session.cart) {
          req.session.cart = {};
      }

      console.log("cart", req.session.cart);
      const subTotal = req.session.cart.subTotal || 0;
      console.log("Subtotal:", subTotal);
      //req.session.cart.finalTotal = subTotal;  

      const coupon = await Coupon.findOne({ userId:userId });

    if (coupon) {
      // Remove the userId from the coupon's userId list
      await Coupon.updateOne({ _id: coupon._id }, { $pull: { userId } });
    }

      req.session.save(err => {
          if (err) {
              console.error("Session save error:", err);
              return res.json({ success: false, message: "Failed to update session" });
          }
          console.log("After removing:", req.session.cart);
          return res.json({ 
              success: true, 
              message: "Coupon Removed", 
              subTotal: subTotal,
              //finalTotal: req.session.cart.finalTotal
          });
      });

  } catch (error) {
      console.error("Error removing coupon:", error);
      return res.json({ success: false, message: "Something went wrong" });
  }
};


const placeOrder = async (req, res) => {
  try {
    const userId = req.session.user._id;
    console.log("Step 1");
    console.log("User ID:", userId);
    console.log("Request Body:", req.body);

    const { orderedItems, discount = 0, address, status, paymentMethod, shipping = 0 } = req.body;

    if (!Array.isArray(orderedItems) || orderedItems.length === 0) {
      return res.status(400).json({ error: "Ordered items are required" });
    }

    //console.log("Ordered Items:", orderedItems);

    let totalPrice = orderedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    let finalAmount = totalPrice + shipping - discount;
    let couponApplied = discount > 0;

    //console.log("Total Price:", totalPrice);
    //console.log("Final Amount:", finalAmount);

    if (address) {
            const addressDoc = await Address.findOne({ userId: userId });
            
            if (!addressDoc) {
              return res.status(404).json({ error: "Address document not found." });
            }
      
            fullAddress = addressDoc.address.find(addr => addr._id.toString() === address);
      
            if (!fullAddress) {
              return res.status(404).json({ error: "Address not found." });
            }
            console.log("Selected Address:", fullAddress);
          }
  
    let orderItems = [];

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

      orderItems.push({
        productId: item.product,
        quantity: item.quantity,
        price: item.price,
        orderStatus: item.orderStatus,
      });
    }

    const newOrder = new Order({
      userId,
      orderId: uuidv4(),
      orderedItems: orderItems,
      totalPrice,
      discount,
      shipping,
      finalAmount,
      address: fullAddress._id,
      status: status || "Order Placed",
      paymentMethod,
      couponApplied,
      trackingHistory: [{ status: "Order Placed" }]
    });

    await newOrder.save();

    await Cart.findOneAndDelete({ userId });

    console.log("Order placed successfully:", newOrder);
    res.status(201).json({ success: true, message: "Order placed successfully", order: newOrder });

  } catch (error) {
    console.error("Order Error:", error);
    res.status(500).json({ error: "Order placement failed" });
  }
};

module.exports = {
    getCheckout,
    //getCoupon,
    applyCoupon,
    removeCoupon,
    placeOrder,
}