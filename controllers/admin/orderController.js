const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Address = require("../../models/addressSchema");
const Order = require("../../models/orderSchema");
const Coupon = require("../../models/couponSchema");
const CustomError = require("../../utils/customError");
const mongodb = require("mongodb");
const mongoose = require("mongoose");
const razorpay = require("razorpay");
const env = require("dotenv").config();
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");

//Order listing
const getOrderListPageAdmin = async (req, res) => {
  try {
    let searchQuery = req.query.search || "";
    let filter = {};

    if (searchQuery) {
      filter.$or = [
        { status: { $regex: searchQuery, $options: "i" } },
        {
          "orderedItems.productId.productName": {
            $regex: searchQuery,
            $options: "i",
          },
        },
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
          { path: "category", select: "name" },
        ],
      });

    let itemsPerPage = 5;
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

//Order details page
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
          { path: "brand", select: "brandName" },
        ],
      })
      .exec();

    if (!order) {
      return res.redirect("/pageNotFound");
    }

    const addressDetails = await Address.findOne({
      userId: order.userId,
    }).exec();

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

    res.render("order-details-admin", {
      order,
      activePage: "order",
      address,
      orderId,
    });
  } catch (error) {
    console.error("Error fetching order details:", error);
    res.redirect("/pageerror");
  }
};

//Updating order status
const updateOrderStatus = async (req, res) => {
  try {
    console.log("Received request to update order status:", req.body);

    const { orderId, status } = req.body;
    if (!orderId || !status) {
      return res.json({ success: false, message: "Invalid request data" });
    }

    const order = await Order.findById(orderId).populate(
      "orderedItems.productId"
    );

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

//Return request loading
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
          { path: "category", select: "name" },
        ],
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
};

//Reject return request
const rejectOrder = async (req, res) => {
  try {
    const { orderId, productId } = req.body;
    //console.log("Rejecting order:", orderId, productId);

    if (!orderId || !productId) {
      return res
        .status(400)
        .json({ success: false, message: "Missing orderId or productId" });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    let itemRejected = false;
    order.orderedItems.forEach((item) => {
      if (item.productId.toString() === productId) {
        item.orderStatus = "Return Denied";
        itemRejected = true;
      }
    });

    if (!itemRejected) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found in order" });
    }

    const allRejected = order.orderedItems.every(
      (item) => item.orderStatus === "Return Denied"
    );
    if (allRejected) {
      order.status = "Return Denied";
    }

    await order.save();
    res
      .status(200)
      .json({ success: true, message: "Order rejected successfully" });
  } catch (error) {
    console.error("Error rejecting order:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

//Approving return request
const approveOrder = async (req, res) => {
  try {
    const { orderId, productId } = req.body;

    if (!orderId || !productId) {
      return res
        .status(400)
        .json({ success: false, message: "Missing orderId or productId" });
    }

    const order = await Order.findById(orderId).populate(
      "orderedItems.productId"
    );
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    const orderedItem = order.orderedItems.find(
      (item) =>
        item.productId.equals(productId) &&
        item.orderStatus === "Return request"
    );
    if (!orderedItem) {
      return res
        .status(404)
        .json({
          success: false,
          message: "Product not found in order or not in Return request status",
        });
    }

    const user = await User.findById(order.userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    let walletCredit = 0;
    let walletCreditRounded = 0;
    const gstRate = 18;
    const itemBasePrice = orderedItem.price * orderedItem.quantity;
    const itemPriceWithGST = itemBasePrice + itemBasePrice * (gstRate / 100);
    const activeTotalPrice = order.orderedItems
      .filter((item) => item.orderStatus !== "Cancelled")
      .reduce((sum, item) => sum + item.price * item.quantity, 0);

    if (order.paymentMethod !== "Cash on Delivery") {
      walletCredit = itemPriceWithGST;

      if (order.couponApplied && order.discount > 0) {
        const discountPerItem =
          (itemBasePrice / activeTotalPrice) * order.discount;
        walletCredit -= discountPerItem;
      }

      walletCreditRounded = parseFloat(walletCredit.toFixed(2));
      if (walletCreditRounded > 0) {
        const userUpdateResult = await User.updateOne(
          { _id: user._id },
          {
            $push: {
              wallet: {
                amount: walletCreditRounded,
                date: new Date(),
                reason: "Refund",
              },
            },
          }
        );
        console.log("User update result:", userUpdateResult);
      }
    }

    const productUpdateResult = await Product.updateOne(
      { _id: productId },
      { $inc: { quantity: orderedItem.quantity } }
    );
    console.log("Product update result:", productUpdateResult);

    const orderItemUpdateResult = await Order.updateOne(
      { _id: orderId, "orderedItems.productId": productId },
      { $set: { "orderedItems.$.orderStatus": "Returned" } }
    );
    console.log("Order item update result:", orderItemUpdateResult);

    const updatedOrder = await Order.findById(orderId);
    const allItemsReturned = updatedOrder.orderedItems
      .filter((item) => item.orderStatus !== "Cancelled")
      .every((item) => item.orderStatus === "Returned");
    const anyPendingReturns = updatedOrder.orderedItems.some(
      (item) => item.orderStatus === "Return request"
    );

    let statusUpdateResult;
    if (allItemsReturned) {
      statusUpdateResult = await Order.updateOne(
        { _id: orderId },
        { $set: { status: "Returned" } }
      );
    } else if (anyPendingReturns) {
      statusUpdateResult = await Order.updateOne(
        { _id: orderId },
        { $set: { status: "Return request" } }
      );
    } else {
      statusUpdateResult = await Order.updateOne(
        { _id: orderId },
        { $set: { status: "Delivered" } }
      );
    }
    console.log("Status update result:", statusUpdateResult);

    return res.status(200).json({
      success: true,
      message: "Order item return request approved successfully!",
      walletCredit: walletCreditRounded,
    });
  } catch (error) {
    console.error("Error approving order:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

module.exports = {
  getOrderListPageAdmin,
  updateOrderStatus,
  getOrderDetailsPageAdmin,
  returnRequest,
  rejectOrder,
  approveOrder,
};
