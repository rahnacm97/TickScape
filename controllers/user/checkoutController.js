const User = require("../../models/userSchema");
const Category = require("../../models/categorySchema");
const Product = require("../../models/productSchema");
const Address = require("../../models/addressSchema");
const Cart = require("../../models/cartSchema");
const Order = require("../../models/orderSchema");
const Coupon = require("../../models/couponSchema");
const env = require("dotenv").config();
const Razorpay = require("razorpay");
const crypto = require("crypto");
const session = require("express-session");
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');

//Checking cart
const checkCart = async (req, res) => {
  try {
      const userId = req.session.user;
      if (!userId) {
          return res.status(401).json({ success: false, message: "User not logged in" });
      }

      const cart = await Cart.findOne({ userId });
      if (!cart || !cart.items || cart.items.length === 0) {
          return res.status(400).json({ success: false, message: "Your cart is empty. Add items to proceed to checkout." });
      }

      return res.status(200).json({ success: true });
  } catch (error) {
      console.error("Error checking cart:", error);
      return res.status(500).json({ success: false, message: "Error checking cart status." });
  }
};

//Checkout page
const getCheckout = async (req, res) => {
  try {
    const userId = req.session.user;
    //console.log("User ID:", userId);
    if (!userId) {
      return res.status(401).json({ success: false, message: "User not logged in" });
    }

    const carts = await Cart.findOne({ userId }).populate("items.productId");
    const address = await Address.find({ userId });
    const user = await User.findById({_id:userId});

    //console.log("Address:", address);

    if (!carts || !carts.items || carts.items.length === 0) {
      req.session.appliedCoupon = null;
      req.session.save();
      return res.render("cart", {
        cart: [],
        user: user,
        errorMessage: "Your cart is empty. Add items to proceed to checkout."
    });
  }

  console.log("user",user);
    // Calculate total price and GST amount
    let total = 0;
    let gstAmount = 0;
    let gstRate = 0;

    carts.items.forEach(item => {
      total += item.totalPrice;
      if (item.productId.gstRate) {
        gstRate = item.productId.gstRate;
        gstAmount += (item.totalPrice * item.productId.gstRate) / 100;
      }
    });

    const cgstAmount = gstAmount / 2;
    const sgstAmount = gstAmount / 2;
    const cgstRate = gstRate / 2;
    const sgstRate = gstRate / 2;

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
      const coupon = await Coupon.findById(appliedCoupon._id);
      if (coupon && total >= coupon.minimumPrice && today <= new Date(coupon.expireOn)) {
        couponDiscount = Math.min(appliedCoupon.discount, total); 
      } else {
        couponDiscount = 0; // Invalid coupon
      }
    }

    // Discount does not exceed total price
    couponDiscount = Math.min(couponDiscount, total);

    const razorpayKey = process.env.RAZORPAY_KEY_ID;

    // Calculating final total including GST
    let finalTotal = total - couponDiscount + gstAmount;

    req.session.gstAmount = gstAmount;
    req.session.finalTotal = finalTotal;
    req.session.couponDiscount = couponDiscount;
    await req.session.save();

    res.render("checkout-cart", {
      carts,
      total,
      gstAmount,
      cgstAmount,
      sgstAmount,
      cgstRate,
      sgstRate,
      address,
      cart: carts.items,
      user: user,
      coupons,
      appliedCoupon: appliedCoupon || null,
      discount: couponDiscount,
      finalTotal,
      couponSuccess: req.session.couponSuccess || null,
      couponError: req.session.couponError || null,
      razorpayKey
    });

    req.session.couponSuccess = null;
    req.session.couponError = null;
    req.session.save();

    console.log("user",user);
    console.log("Applied Coupon in Session:", req.session.appliedCoupon);
    console.log("Total:", total);
    console.log("GST Amount:", gstAmount);
    console.log("Discount Applied:", couponDiscount);
    console.log("Final Total:", finalTotal);

  } catch (error) {
    console.error("Error loading checkout page:", error);
    res.status(500).send("An error occurred while loading the checkout page.");
  }
};

//Coupon applying
const applyCoupon = async (req, res) => {
  try {
    console.log("Coupon request received:", req.body);
    const { couponCode, carts } = req.body;
    const userId = req.session.user;

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

    const subTotal = carts.reduce((acc, item) => acc + (item.price * (item.quantity ?? 1)), 0);
    console.log("Subtotal:", subTotal);

    const gstRate = 18;
    const gstAmount = (subTotal * gstRate) / 100;
    console.log("GST Amount:", gstAmount);
    const finalAmount = subTotal + gstAmount + 50;

    const coupon = await Coupon.findOne({ name: couponCode }).lean();
    if (!coupon) {
      return res.json({ success: false, message: "Invalid coupon" });
    }

    const today = new Date();
    if (today < new Date(coupon.createdOn) || today > new Date(coupon.expireOn)) {
      return res.json({ success: false, message: "Coupon expired or not valid yet" });
    }

    if (finalAmount < coupon.minimumPrice) {
      return res.json({ success: false, message: `Minimum purchase should be ₹${coupon.minimumPrice}` });
    }

    const couponDiscount = coupon.offerPrice;
    console.log("Discount Applied:", couponDiscount);

    const finalTotal = Math.max(subTotal + gstAmount - couponDiscount, 0);
    console.log("Final Total After Discount:", finalTotal);

    req.session.appliedCoupon = {
      _id: coupon._id,
      name: coupon.name,
      discount: couponDiscount,
    };

    req.session.couponDiscount = couponDiscount;

    if (!req.session.cart) {
      req.session.cart = {};
    }

    req.session.cart.subTotal = subTotal;
    req.session.cart.gstAmount = gstAmount;
    req.session.cart.finalTotal = finalTotal;

    req.session.save();

    return res.json({
      success: true,
      message: "Coupon Applied Successfully!",
      subTotal,
      gstAmount,
      finalTotal,
      couponDiscount,
      appliedCoupon: req.session.appliedCoupon
    });

  } catch (error) {
    console.error("Error applying coupon:", error);
    return res.status(500).json({ success: false, message: "Something went wrong" });
  }
};

//Coupon removing
const removeCoupon = async (req, res) => {
  try {
    const userId = req.session.user;

    if (!userId) {
      return res.status(401).json({ success: false, message: "User not logged in" });
    }

    if (!req.session.appliedCoupon) {
      return res.json({ success: false, message: "No coupon applied" });
    }

    console.log("Before removing coupon:", req.session.appliedCoupon);

    const discount = req.session.appliedCoupon.discount || 0;
    req.session.appliedCoupon = null; 

    if (!req.session.cart) {
      req.session.cart = {};
    }

    const subTotal = req.session.cart.subTotal || 0;
    console.log("Subtotal:", subTotal);

    const gstRate = 18; 
    const gstAmount = (subTotal * gstRate) / 100;
    console.log("GST Amount:", gstAmount);

    const finalTotal = subTotal + gstAmount; 

    req.session.cart.gstAmount = gstAmount;
    req.session.cart.finalTotal = finalTotal;

    req.session.save(err => {
      if (err) {
        console.error("Session save error:", err);
        return res.json({ success: false, message: "Failed to update session" });
      }
      console.log("After removing coupon:", req.session.cart);
      return res.json({ 
        success: true, 
        message: "Coupon Removed", 
        subTotal,
        gstAmount,
        finalTotal
      });
    });

  } catch (error) {
    console.error("Error removing coupon:", error);
    return res.json({ success: false, message: "Something went wrong" });
  }
};


const paymentFailure = async(req,res)=>{ 
  res.render("payment-failure") 
}

const razorpayInstance = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

//Payment integration
const razorpayPayment = async (req, res) => {
  try {
      const userId = req.session.user;
      const addressId = req.body.addressId;

      console.log("Session Data:", req.session);

      const addressData = await Address.findOne(
          { userId, "address._id": addressId },
          { "address.$": 1 }
      );
      if (!addressData || !addressData.address || !addressData.address.length) {
          return res.status(400).json({ success: false, message: "Address not found." });
      }

      const cart = await Cart.findOne({ userId }).populate("items.productId");
      if (!cart || !cart.items || cart.items.length === 0) {
          return res.status(400).json({ success: false, message: "Cart is empty." });
      }

      let totalOfferPrice = 0;
      let orderItems = [];

      cart.items.forEach(item => {
          if (!item.productId) {
              throw new Error("Invalid cart item: Product ID missing.");
          }
          totalOfferPrice += (item.productId.salePrice || item.productId.regularPrice || 0) * item.quantity;
          orderItems.push({
              productId: item.productId._id,
              quantity: item.quantity,
              price: item.productId.salePrice || item.productId.regularPrice,
              productName: item.productId.productName,
              productImage: item.productId.productImage ? item.productId.productImage[0] : null,
              orderStatus: "Order Placed"
          });
      });

      // Always recalculate finalAmount 
      let couponDiscount = req.session.couponDiscount || 0;
      let appliedCoupon = req.session.appliedCoupon ? req.session.appliedCoupon._id : null;

      // Revalidate coupon if applied
      if (req.session.appliedCoupon) {
          const coupon = await Coupon.findById(req.session.appliedCoupon._id);
          const today = new Date();
          if (coupon && totalOfferPrice >= coupon.minimumPrice && today <= new Date(coupon.expireOn)) {
              couponDiscount = Math.min(req.session.appliedCoupon.discount, totalOfferPrice);
          } else {
              couponDiscount = 0;
          }
      }

      let shippingCharge = 50;
      let gstAmount = req.session.gstAmount || (totalOfferPrice * 0.18);
      let finalAmount = Math.max(totalOfferPrice - couponDiscount + shippingCharge + gstAmount, 0);

      let couponApplied = couponDiscount > 0;

      console.log("Coupon Discount:", couponDiscount);
      console.log("Final Amount:", finalAmount);

      if (finalAmount === 0) {
          return res.status(400).json({ success: false, message: "Order amount must be greater than zero." });
      }

      const options = { 
          amount: Math.round(finalAmount * 100), 
          currency: "INR",
          receipt: `order_${Date.now()}`
      };

      let razorpayOrder;
      try {
          razorpayOrder = await razorpayInstance.orders.create(options);
          console.log("Razorpay Order Response:", razorpayOrder);
      } catch (razorpayError) {
          console.error("Razorpay API Error:", razorpayError);
          throw new Error(`Failed to create Razorpay order: ${razorpayError.message || 'Unknown error'}`);
      }

      if (!razorpayOrder || !razorpayOrder.id) {
          throw new Error("Failed to create Razorpay order: Invalid response from Razorpay.");
      }

      req.session.orderDetails = {
          userId,
          orderedItems: orderItems,
          totalPrice: totalOfferPrice,
          gstAmount,
          discount: couponDiscount,
          shipping: shippingCharge,
          finalAmount,
          address: addressData.address[0]._id,
          paymentMethod: "Online Payment",
          paymentInfo: { transactionId: razorpayOrder.id },
          couponApplied,
          appliedCoupon
      };

      req.session.finalTotal = finalAmount;
      await req.session.save();

      res.status(200).json({
          success: true,
          order: razorpayOrder
      });

  } catch (error) {
      console.error("Razorpay Payment Error:", error.message, error.stack);
      res.status(500).json({ success: false, message: error.message });
  }
};

//Razorpay verification
const verifyRazorpay = async (req, res) => {
  try {
      const { order_id, payment_id, signature } = req.body;
      const userId = req.session.user;

      if (!process.env.RAZORPAY_KEY_SECRET) {
          console.error("Razorpay key secret is missing!");
          return res.status(500).json({ success: false, message: "Server error: Payment configuration missing." });
      }

      const generatedSignature = crypto
          .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
          .update(order_id + "|" + payment_id)
          .digest("hex");

      if (generatedSignature !== signature) {
          return res.status(400).json({ success: false, message: "Payment verification failed" });
      }

      const orderDetails = req.session.orderDetails;
      if (!orderDetails || orderDetails.paymentInfo.transactionId !== order_id) {
          return res.status(400).json({ success: false, message: "Invalid order details or session expired." });
      }

      // Deduct product quantities
      for (const item of orderDetails.orderedItems) {
          const product = await Product.findById(item.productId);
          if (!product) {
              throw new Error(`Product with ID ${item.productId} not found.`);
          }
          if (product.quantity < item.quantity) {
              throw new Error(`Insufficient stock for product ${product.productName}.`);
          }
          await Product.findByIdAndUpdate(
              item.productId,
              { $inc: { quantity: -item.quantity } },
              { new: true }
          );
      }

      let couponApplied = false;
      let appliedCoupon = null;
      let discount = orderDetails.discount || 0;

        if (req.session.appliedCoupon) {
            couponApplied = true;
            appliedCoupon = req.session.appliedCoupon._id;
            discount = req.session.appliedCoupon.discount || discount; 
            console.log("Applied Coupon in verifyRazorpay:", req.session.appliedCoupon);
        }

        const finalAmount = (
            orderDetails.totalPrice +
            (orderDetails.gstAmount || 0) +
            (orderDetails.shipping || 0) -
            discount
        ).toFixed(2);

        const newOrder = new Order({
            userId: orderDetails.userId,
            orderedItems: orderDetails.orderedItems,
            totalPrice: orderDetails.totalPrice,
            gstAmount: orderDetails.gstAmount || 0,
            discount: discount,
            shipping: orderDetails.shipping || 0,
            finalAmount: finalAmount,
            address: orderDetails.address,
            status: "Order Placed",
            paymentMethod: "Online Payment",
            couponApplied: couponApplied,
            appliedCoupon: appliedCoupon,
            paymentInfo: {
                paymentId: payment_id,
                status: "Success",
                attempts: 0,
                lastAttempted: new Date()
            },
            trackingHistory: [{ status: "Order Placed" }]
        });

      const savedOrder = await newOrder.save();

      // Clear the cart
      await Cart.findOneAndDelete({ userId: orderDetails.userId });

      if (req.session.appliedCoupon) {
        await Coupon.updateOne(
            { name: req.session.appliedCoupon.name },
            { $push: { userId: userId } }
        );
    }

      req.session.orderDetails = null;
      req.session.appliedCoupon = null;

      res.status(200).json({
          success: true,
          message: "Payment verified successfully",
          order: savedOrder 
      });

  } catch (error) {
      console.error("Verify Razorpay Error:", error.message, error.stack);
      res.status(500).json({ success: false, message: error.message });
  }
};

//Pending order
const savePendingOrder = async (req, res) => {
  try {
    const userId = req.session.user;
    const { addressId } = req.body;

    // Fetch address
    const addressData = await Address.findOne(
      { userId, "address._id": addressId },
      { "address.$": 1 }
    );
    if (!addressData || !addressData.address || !addressData.address.length) {
      return res.status(400).json({ success: false, message: "Address not found." });
    }

    // Fetch cart
    const cart = await Cart.findOne({ userId }).populate("items.productId");
    if (!cart || !cart.items || cart.items.length === 0) {
      return res.status(400).json({ success: false, message: "Cart is empty." });
    }

    // Calculate order details
    let totalOriginalPrice = 0;
    let totalOfferPrice = 0;
    let orderItems = [];

    cart.items.forEach(item => {
      if (!item.productId) {
        throw new Error("Invalid cart item: Product ID missing.");
      }
      totalOriginalPrice += (item.productId.regularPrice || 0) * item.quantity;
      totalOfferPrice += (item.productId.salePrice || 0) * item.quantity;
      orderItems.push({
        productId: item.productId._id,
        quantity: item.quantity,
        price: item.productId.salePrice || item.productId.regularPrice,
        productName: item.productId.productName,
        productImage: item.productId.productImage ? item.productId.productImage[0] : null,
        orderStatus: "Order Placed",
      });
    });

    let couponDiscount = req.session.couponDiscount || 0;
    let couponApplied = couponDiscount > 0;
    let appliedCoupon = req.session.appliedCoupon ? req.session.appliedCoupon._id : null;

    let shippingCharge = 50;
    let gstAmount = req.session.gstAmount || (totalOfferPrice * 0.18);
    let totalPrice = orderItems.reduce((sum, item) => sum + ((parseFloat(item.price) || 0) * (parseInt(item.quantity) || 0)), 0);
    let finalAmount = Math.max(totalOfferPrice - couponDiscount + shippingCharge + gstAmount, 0);

    if (finalAmount === 0) {
      return res.status(400).json({ success: false, message: "Order amount must be greater than zero." });
    }

    // Save order with "Pending" payment status
    const newOrder = new Order({
      userId,
      orderedItems: orderItems,
      totalPrice,
      gstAmount,
      discount: couponDiscount,
      shipping: shippingCharge,
      finalAmount,
      address: addressData.address[0]._id,
      status: "Payment Pending",
      paymentMethod: "Online Payment",
      couponApplied,
      appliedCoupon,
      paymentInfo: {
        status: "Pending",
        attempts: 0,
        lastAttempted: new Date(),
      },
      trackingHistory: [{ status: "Order Placed" }],
    });

    const savedOrder = await newOrder.save();

    // Clear the cart
    await Cart.findOneAndDelete({ userId });

    if (req.session.appliedCoupon) {
      await Coupon.updateOne(
        { name: req.session.appliedCoupon.name },
        { $push: { userId } }
      );
    }

    req.session.orderDetails = null;
    req.session.appliedCoupon = null;

    res.status(200).json({
      success: true,
      message: "Order placed with pending payment",
      order: savedOrder,
    });
  } catch (error) {
    console.error("Save Pending Order Error:", error.message, error.stack);
    res.status(500).json({ success: false, message: error.message });
  }
};

//Placing order
const placeOrder = async (req, res) => {
  try {
      const userId = req.session.user;
      //console.log("Step 1 - User ID:", userId);
      console.log("Request Body:", req.body);

      const { orderedItems, discount = 0, address, status, paymentMethod, shipping = 0 , gstAmount = 0} = req.body;

      if (!Array.isArray(orderedItems) || orderedItems.length === 0) {
          return res.status(400).json({ success: false, message: "Ordered items are required." });
      }

      let totalPrice = orderedItems.reduce((sum, item) => sum + ((parseFloat(item.price) || 0) * (parseInt(item.quantity) || 0)), 0);
      let finalAmount = (totalPrice + (shipping || 0) - (discount || 0) + ( gstAmount|| 0)).toFixed(2);

      if (isNaN(finalAmount) || finalAmount <= 0) {
          return res.status(400).json({ error: "Invalid payment amount. Please check the cart total." });
      }


      if (paymentMethod === "Cash on Delivery" && finalAmount > 1000) {
        return res.status(400).json({
            success: false,
            message: "Cash on Delivery is not available for orders above ₹1000."
        });
      }

      let couponApplied = discount > 0;
      let appliedCoupon = null;

      // console.log("Coupon Applied:", couponApplied);
      // console.log("Applied Coupon in Session:", req.session.appliedCoupon);

      if (req.session.appliedCoupon && couponApplied) {
        appliedCoupon = req.session.appliedCoupon._id; 
        console.log("Applied Coupon ID:", appliedCoupon);
      }

      let fullAddress;
      if (address) {
          const addressDoc = await Address.findOne({ userId: userId });
          if (!addressDoc) {
              return res.status(404).json({ success: false, message: "Address document not found." });
          }
          fullAddress = addressDoc.address.find(addr => addr._id.toString() === address);
          if (!fullAddress) {
              return res.status(404).json({ success: false, message: "Address not found." });
          }
      }

      let orderItems = [];
      for (const item of orderedItems) {
          if (!item.product) {
              return res.status(400).json({ success: false, message: "Invalid item format: Missing product ID." });
          }

          const product = await Product.findById(item.product);
          if (!product) {
              return res.status(404).json({ success: false, message: `Product with ID ${item.product} not found.` });
          }

          if (product.quantity < item.quantity) {
              return res.status(400).json({ success: false, message: `Insufficient stock for product ${product.productName}.` });
          }

          await Product.findByIdAndUpdate(
              item.product,
              { $inc: { quantity: -item.quantity } },
              { new: true }
          );

          orderItems.push({
              productId: item.product,
              quantity: item.quantity,
              price: item.price,
              orderStatus: item.orderStatus,
              productName:product.productName,
              productImage:product.productImage[0],
          });
      }

      const newOrder = new Order({
          userId,
          orderedItems: orderItems,
          totalPrice,
          discount,
          shipping,
          finalAmount,
          gstAmount,
          address: fullAddress._id,
          status: status || "Order Placed",
          paymentMethod,
          couponApplied,
          appliedCoupon,
          trackingHistory: [{ status: "Order Placed" }],
          paymentInfo: {
            paymentId: req.body.paymentId || null, 
            status: req.body.paymentStatus || 'Pending' 
        }
      });

      console.log("Ordered Items:", orderedItems);
      console.log("Total Price:", totalPrice);
      console.log("Final Amount:", finalAmount);
      console.log("GST Amount:", gstAmount);

      await newOrder.save();

      if (req.session.appliedCoupon) {
          await Coupon.updateOne(
              { name: req.session.appliedCoupon.name },
              { $push: { userId: userId } }
          );
      }

      req.session.appliedCoupon = null;
      req.session.couponDiscount = 0;

      await Cart.findOneAndDelete({ userId });

      console.log("Order placed successfully:", newOrder);
      res.status(201).json({ success: true, message: "Order placed successfully", order: newOrder });
  } catch (error) {
      console.error("Order Error:", error);
      res.status(500).json({ success: false, message: "Order placement failed." });
  }
};

//User wallet
const getUserWalletBalance = async (req, res) => {
  //console.log("1")
  try {
    const userId = req.session.user;
    let user = await User.findById(userId);
    //console.log("user",user);
    if (!user) return res.status(404).json({ message: "User not found" });

    let walletTransactions = user.wallet || [];
    console.log("walletTransactions",walletTransactions);
    
    // Calculate total wallet balance
    let walletBalance = walletTransactions.reduce((acc, transaction) => acc + transaction.amount, 0);
    console.log("walletBalance",walletBalance);

    res.json({ wallet: walletBalance });
  } catch (error) {
    console.error("Error fetching wallet balance:", error);
    res.status(500).json({ message: "Error fetching wallet balance" });
  }
};

//Wallet amount deduction
const deductWalletBalance = async (req, res) => {
  try {
    const userId = req.session.user;
    let user = await User.findById(userId);

    if (!user) return res.status(404).json({ message: "User not found" });

    let walletTransactions = user.wallet || [];
    console.log("walletTransactions1",walletTransactions);
    
    // Calculate wallet balance
    let walletBalance = walletTransactions.reduce((acc, transaction) => acc + transaction.amount, 0);
    console.log("walletBalance1",walletBalance);

    // Check if balance is sufficient
    if (walletBalance < req.body.amount) {
      return res.status(400).json({ success: false, message: "Insufficient funds" });
    }

    user.wallet.push({ amount: -req.body.amount, date: new Date(), reason: "Order Payment" });

    await user.save();
    console.log(user,"after save")

    res.json({ success: true, message: "Amount deducted successfully" });
  } catch (error) {
    console.error("Error deducting wallet balance:", error);
    res.status(500).json({ message: "Error deducting wallet balance" });
  }
};


module.exports = {
    checkCart,
    getCheckout,
    applyCoupon,
    removeCoupon,
    razorpayPayment,
    verifyRazorpay,
    savePendingOrder,
    getUserWalletBalance,
    deductWalletBalance,
    paymentFailure,
    placeOrder,
}