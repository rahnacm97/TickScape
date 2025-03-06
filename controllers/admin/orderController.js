const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Address = require("../../models/addressSchema");
const Order = require("../../models/orderSchema");
const Coupon=require("../../models/couponSchema");
const CustomError = require('../../utils/customError');
const mongodb = require("mongodb");
const mongoose = require('mongoose')
const razorpay = require("razorpay");
const env = require("dotenv").config();
const crypto = require("crypto");
const { v4: uuidv4 } = require('uuid');

const getOrderListPageAdmin = async (req, res) => {
  try {
    let searchQuery = req.query.search || "";
    let filter = {};

    if (searchQuery) {
      filter.$or = [
        { status: { $regex: searchQuery, $options: "i" } },
        {
          "orderedItems.productId.productName": { $regex: searchQuery, $options: "i" }
        }
      ];
    }

    const orders = await Order.find(filter)
    .sort({ createdOn: -1 })
    .populate("userId")
    .populate({
      path: "orderedItems.productId", 
      select: "productName salePrice",        
      populate: [
        { path: "brand", select: "brandName" },
        { path: "category", select: "name" }
      ]
    });

    let itemsPerPage = 4;
    let currentPage = parseInt(req.query.page) || 1;
    let startIndex = (currentPage - 1) * itemsPerPage;
    let endIndex = startIndex + itemsPerPage;
    let totalPages = Math.ceil(orders.length / itemsPerPage);
    const currentOrder = orders.slice(startIndex, endIndex);

   // console.log("Filtered Orders:", currentOrder);

    res.render("order-list", { 
      orders: currentOrder, 
      totalPages, 
      currentPage, 
      searchQuery,
      limit: itemsPerPage,
    });
  } catch (error) {
    res.redirect("/pageerror");
  }
};


const getOrderDetailsPageAdmin = async (req, res) => {
  try {
    const orderId = req.params.id;
    console.log("Fetching order details for:", orderId);

    const order = await Order.findOne({ _id: orderId })
      .populate("userId", "fname lname email phone")  
      .populate({
        path: "orderedItems.productId",
        populate: [
          { path: "category", select: "name" },
          { path: "brand", select: "brandName" }
        ],
      })
      .exec();

    if (!order) {
      return res.redirect("/pageNotFound");
    }

    const addressDetails = await Address.findOne({ userId: order.userId }).exec();

    if (!addressDetails || !addressDetails.address) {
      console.error("Address details not found for the user");
      return res.redirect("/pageerror");
    }

    const address = addressDetails.address.find(
      (addr) => addr._id.toString() === order.address.toString()
    );

    if (!address) {
      console.error("Address not found for the given addressId");
      return res.redirect("/pageerror");
    }

    console.log("Order details:", order);

    res.render("order-details-admin", { order, activePage: "order", address, orderId });
  } catch (error) {
    console.error("Error fetching order details:", error);
    res.redirect("/pageerror");
  }
};


// const updateOrderStatus = async (req, res) => {
//   try {
    
//     console.log("Received request to update order status:", req.body);

//     const { orderId, status } = req.body;
//     if (!orderId || !status) {
//       return res.json({ success: false, message: "Invalid request data" });
//     }

//     const order = await Order.findById(orderId).populate("orderedItems.productId");

//     if (!order) {
//       return res.json({ success: false, message: "Order not found" });
//     }

//     if (order.status === "Delivered" || order.status === "Cancelled") {
//       return res.json({
//         success: false,
//         message: "Cannot modify Delivered or Cancelled orders",
//       });
//     }

//     let hasStatusChanged = false;
//     let bulkUpdates = [];

//     for (const item of order.orderedItems) {
//       if (item.orderStatus !== "Cancelled") {
//         item.orderStatus = status;
//         hasStatusChanged = true;

//         if (status === "Cancelled" && item.productId) {
//           bulkUpdates.push({
//             updateOne: {
//               filter: { _id: item.productId._id },
//               update: { $inc: { quantity: item.quantity } },
//             },
//           });
//         }
//       }
//     }

//     if (bulkUpdates.length > 0) {
//       await Product.bulkWrite(bulkUpdates);
//     }

//     if (hasStatusChanged) {
//       const formattedDate = new Date().toISOString();
//       const lastEntry = order.trackingHistory[order.trackingHistory.length - 1];

//       if (!lastEntry || lastEntry.status !== status) {
//         order.trackingHistory.push({ date: formattedDate, status });
//       }

//       order.status = status;
//       await order.save();
//     }

//     res.json({ success: true, message: "Order status updated successfully" });
//   } catch (error) {
//     console.error("Error updating order:", error);
//     res.json({ success: false, message: "Internal server error" });
//   }
// };

const updateOrderStatus = async (req, res) => {
  try {
    console.log("Received request to update order status:", req.body);

    const { orderId, status } = req.body;
    if (!orderId || !status) {
      return res.json({ success: false, message: "Invalid request data" });
    }

    const order = await Order.findById(orderId).populate("orderedItems.productId");

    if (!order) {
      return res.json({ success: false, message: "Order not found" });
    }

    if (order.status === "Delivered" || order.status === "Cancelled") {
      return res.json({
        success: false,
        message: "Cannot modify Delivered or Cancelled orders",
      });
    }

    let hasStatusChanged = false;
    let bulkUpdates = [];

    for (const item of order.orderedItems) {
      if (item.orderStatus !== "Cancelled") {
        item.orderStatus = status;
        hasStatusChanged = true;

        if (status === "Cancelled" && item.productId) {
          bulkUpdates.push({
            updateOne: {
              filter: { _id: item.productId._id },
              update: { $inc: { quantity: item.quantity } },
            },
          });
        }
      }
    }

    if (bulkUpdates.length > 0) {
      await Product.bulkWrite(bulkUpdates);
    }

    if (hasStatusChanged) {
      const formattedDate = new Date().toISOString();
      const lastEntry = order.trackingHistory[order.trackingHistory.length - 1];

      if (!lastEntry || lastEntry.status !== status) {
        order.trackingHistory.push({ date: formattedDate, status });
      }

      order.status = status;
      await order.save();
    }

    res.json({ success: true, message: "Order status updated successfully" });
  } catch (error) {
    console.error("Error updating order:", error);
    res.json({ success: false, message: "Internal server error" });
  }
};


const returnRequest = async (req, res) => {
  try {

    const orders = await Order.find({ status: "Return request" })
    .sort({ createdOn: -1 })
    .populate("userId")
    .populate({
      path: "orderedItems.productId", 
      select: "productName salePrice",        
      populate: [
        { path: "brand", select: "brandName" },
        { path: "category", select: "name" }
      ]
    });

    let itemsPerPage = 5;
    let currentPage = parseInt(req.query.page) || 1;
    let startIndex = (currentPage - 1) * itemsPerPage;
    let endIndex = startIndex + itemsPerPage;
    let totalPages = Math.ceil(orders.length / itemsPerPage);
    const currentOrder = orders.slice(startIndex, endIndex);

    //console.log("Filtered Orders:", currentOrder);

    res.render("return-request", { 
      orders: currentOrder, 
      totalPages, 
      currentPage, 
      limit: itemsPerPage,
    });
  } catch (error) {
    res.redirect("/pageerror");
  }
}

const rejectOrder = async (req, res) => {
  try {
      const { orderId, productId } = req.body;
      //console.log("Rejecting order:", orderId, productId);

      if (!orderId || !productId) {
          return res.status(400).json({ success: false, message: "Missing orderId or productId" });
      }

      const order = await Order.findById(orderId);
      if (!order) {
          return res.status(404).json({ success: false, message: "Order not found" });
      }

      let itemRejected = false;
      order.orderedItems.forEach((item) => {
          if (item.productId.toString() === productId) {
              item.orderStatus = "Return Denied";
              itemRejected = true;
          }
      });

      if (!itemRejected) {
          return res.status(404).json({ success: false, message: "Product not found in order" });
      }

      const allRejected = order.orderedItems.every(item => item.orderStatus === "Return Denied");
      if (allRejected) {
          order.status = "Return Denied";
      }

      await order.save();
      res.status(200).json({ success: true, message: "Order rejected successfully" });
  } catch (error) {
      console.error("Error rejecting order:", error);
      res.status(500).json({ success: false, message: "Internal server error" });
  }
};


const approveOrder = async (req, res) => {
  try {
    const { orderId, productId } = req.body;
    console.log("Approving order:", orderId, productId);

    if (!orderId || !productId) {
      return res.status(400).json({ success: false, message: "Missing orderId or productId" });
    }

    const order = await Order.findById(orderId).populate('orderedItems.productId');
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const orderedItem = order.orderedItems.find(
      (item) => item.productId.equals(productId) && item.orderStatus === "Return request"
    );

    if (!orderedItem) {
      return res.status(404).json({ success: false, message: "Product not found in order" });
    }

    const user = await User.findById(order.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    let walletCredit = 0;
    const gstRate = 18; // GST rate (modify if needed)
    const itemPriceWithGST = orderedItem.price + (orderedItem.price * (gstRate / 100));

    if (order.paymentMethod !== "Cash on Delivery") {
      if (order.couponApplied && order.appliedCoupon) {
        const coupon = await Coupon.findById(order.appliedCoupon);
        if (coupon) {
          const totalItems = order.orderedItems.length;
          const finalAmount = order.finalAmount;
          const returnItemsCount = order.orderedItems.filter(item => item.orderStatus === "Return request").length;
          const isReturningAll = returnItemsCount === totalItems;

          if (isReturningAll) {
            walletCredit += order.discount; // Full discount refund if all items are returned
          } else {
            const discountContribution = (itemPriceWithGST / finalAmount) * order.discount;
            walletCredit += itemPriceWithGST - discountContribution; // Price with GST minus discount share
          }

          await Coupon.updateOne({ _id: order.appliedCoupon }, { $push: { users: user._id } });
        }
      } else {
        // No coupon applied → Refund full price including GST
        walletCredit += itemPriceWithGST;
      }

      const walletCreditRounded = parseFloat(walletCredit.toFixed(2));
      await User.updateOne(
        { _id: user._id },
        { $push: { wallet: { amount: walletCreditRounded, date: new Date() } } }
      );
    }

    // Update product stock
    await Product.updateOne({ _id: productId }, { $inc: { quantity: orderedItem.quantity } });

    // Update order status
    await Order.updateOne(
      { _id: orderId, "orderedItems.productId": productId },
      { $set: { "orderedItems.$.orderStatus": "Returned" } }
    );

    // Check if all items are returned
    const updatedOrder = await Order.findById(orderId);
    const allItemsReturned = updatedOrder.orderedItems.every(item => item.orderStatus === "Returned");

    if (allItemsReturned) {
      await Order.updateOne({ _id: orderId }, { $set: { status: "Returned" } });
    } else {
      await Order.updateOne({ _id: orderId }, { $set: { status: "Delivered" } });
    }

    return res.status(200).json({ success: true, message: "Order item return request approved successfully!" });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};


module.exports = {
  getOrderListPageAdmin,
  updateOrderStatus,
  getOrderDetailsPageAdmin,
  returnRequest,
  rejectOrder,
  approveOrder
}
