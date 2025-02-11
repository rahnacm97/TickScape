const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Address = require("../../models/addressSchema");
const Order = require("../../models/orderSchema");
const Coupon=require("../../models/couponSchema");
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
        { "productId.productName": { $regex: searchQuery, $options: "i" } }
      ];
    }

    const orders = await Order.find(filter)
      .sort({ createdOn: -1 })
      .populate("userId")
      .populate({
        path: "productId",
        populate: [
          { path: "brand", select: "brandName" },
          { path: "category", select: "name" }
        ]
      });

    let itemsPerPage = 3;
    let currentPage = parseInt(req.query.page) || 1;
    let startIndex = (currentPage - 1) * itemsPerPage;
    let endIndex = startIndex + itemsPerPage;
    let totalPages = Math.ceil(orders.length / itemsPerPage);
    const currentOrder = orders.slice(startIndex, endIndex);

    console.log("Filtered Orders:", currentOrder);

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

// const getOrderDetailsPageAdmin = async (req, res) => {
//   try {
//       const orderId = req.params.id;  
//       console.log("Fetching order details for:", orderId);

//       const order = await Order.findOne({ _id: orderId })
//           .populate("userId", "fname lname email phone")  
//           .populate({
//             path: 'productId',
//             populate: { path: 'category', select: 'name' }
//         }).populate({
//           path: 'productId',
//           populate: { path: 'brand', select: 'brandName' }
//       })
//           .exec();
//       if (!order) {
//           return res.redirect("/pageNotFound");
//       }
    
//     const addressDetails = await Address.findOne({ userId: order.userId }).exec();
  
//     const address = addressDetails.address.find(
//       (addr) => addr._id.toString() === order.address.toString()
//     );
//     console.log(address);
   
//     if (!address) {
//       console.error("Address not found for the given addressId");
//       return res.redirect("/pageerror");
//     }

//       order.trackingHistory = [
//         { date: '2025-01-01', status: 'Order Placed' },
//         { date: '2025-01-03', status: 'Processing' },
//         { date: '2025-01-04', status: 'Cancelled' },
//         { date: '2025-01-05', status: 'Shipped' },
//         { date: '2025-01-07', status: 'Out for Delivery' },
//         { date: '2025-01-08', status: 'Delivered' }
//       ];

//       console.log("Order details:", order);
      
//       res.render("order-details-admin", { order, activePage: "order" ,address, orderId});

//   } catch (error) {
//       console.error("Error fetching order details:", error);
//       res.redirect("/pageerror");
//   }
// };

const getOrderDetailsPageAdmin = async (req, res) => {
  try {
    const orderId = req.params.id;
    console.log("Fetching order details for:", orderId);

    const order = await Order.findOne({ _id: orderId })
      .populate("userId", "fname lname email phone")  
      .populate({
        path: "productId",
        populate: { path: "category", select: "name" },
      })
      .populate({
        path: "productId",
        populate: { path: "brand", select: "brandName" },
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

//     const order = await Order.findById(orderId).populate("productId");

//     if (!order) {
//       return res.json({ success: false, message: "Order not found" });
//     }

    
//     if (order.status === "Delivered" || order.status === "Cancelled") {
//       return res.json({
//         success: false,
//         message: "Cannot modify Delivered or Cancelled orders",
//       });
//     }

//     if (status === "Cancelled" && order.productId) {
//       order.productId.quantity += order.quantity;
//       await order.productId.save();
//     }

    
//     if (status === "Delivered" && order.productId) {
//       if (order.productId.quantity >= order.quantity) {
//         order.productId.quantity -= order.quantity;
//         await order.productId.save();
//       } else {
//         return res.json({
//           success: false,
//           message: `Not enough stock for ${order.productId.productName}`,
//         });
//       }
//     }

//     order.status = status;
//     await order.save();

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

    const order = await Order.findById(orderId).populate("productId");

    if (!order) {
      return res.json({ success: false, message: "Order not found" });
    }

    if (order.status === "Delivered" || order.status === "Cancelled") {
      return res.json({
        success: false,
        message: "Cannot modify Delivered or Cancelled orders",
      });
    }

    // If status is "Cancelled", restore stock quantity
    if (status === "Cancelled" && order.productId) {
      order.productId.quantity += order.quantity;
      await order.productId.save();
    }

    // If status is "Delivered", decrease stock quantity
    if (status === "Delivered" && order.productId) {
      if (order.productId.quantity >= order.quantity) {
        order.productId.quantity -= order.quantity;
        await order.productId.save();
      } else {
        return res.json({
          success: false,
          message: `Not enough stock for ${order.productId.productName}`,
        });
      }
    }

     // Add tracking history entry if status is changing
     const formattedDate = new Date().toISOString().split('T')[0];
     const lastEntry = order.trackingHistory[order.trackingHistory.length - 1];
 
     if (!lastEntry || lastEntry.status !== status) {
       order.trackingHistory.push({ date: formattedDate, status });
     }
 
     order.status = status;
     await order.save();

    res.json({ success: true, message: "Order status updated successfully" });
  } catch (error) {
    console.error("Error updating order:", error);
    res.json({ success: false, message: "Internal server error" });
  }
};



module.exports = {
  getOrderListPageAdmin,
  updateOrderStatus,
  getOrderDetailsPageAdmin,
}
