const User = require("../../models/userSchema");
const Category = require("../../models/categorySchema");
const Product = require("../../models/productSchema");
const Address = require("../../models/addressSchema");
const Cart = require("../../models/cartSchema");
const Order = require("../../models/orderSchema");
const env = require("dotenv").config();
const session = require("express-session");
const mongoose = require('mongoose');

const getConfirmation = async (req, res) => {
    try {
        let orders = {};
        if (req.query.orders) {
            orders = JSON.parse(decodeURIComponent(req.query.orders));           
            const populatedOrders = await Promise.all(
                orders.previewOrder.map(async (order) => {
                    const product = await Product.findById(order.product);
                    const address = await Address.findById(order.address); 
                    return {
                        ...order,
                        product: product ? product.toObject() : null, 
                        address: address ? address.toObject() : null,
                    };
                })
            );
            orders.previewOrder = populatedOrders;
        }
        // console.log("Orders with Address:", orders);
        res.render("orders", { 
            orders,
            user: req.session.user,
            orderId: orders.previewOrder[0]?.address?._id,
        }); 
    } catch (error) {
        console.error("Error processing orders:", error);
        res.status(500).send("Error loading the page");
    }
};

// const getOrders = async(req,res) => {
//     try { 
//         const userId = req.session.user._id;
//         const page = parseInt(req.query.page) || 1;
//         const limit = 4; 
//         const skip = (page - 1) * limit;

//         const orders = await Order.find({ userId: userId })
//             .populate('productId')
//             .sort({ createdOn: -1 })
//             .skip(skip)
//             .limit(limit)
//             .exec();

//         const totalOrders = await Order.countDocuments({ userId: userId });

//         const formattedOrders = orders.map(order => ({
//             productId: order.productId._id,
//             productName: order.productId.productName,
//             productImage: order.productId.productImage,
//             quantity: order.quantity,
//             price: order.price,
//             totalPrice: order.totalPrice,
//             discount: order.discount,
//             address: order.address,
//             status: order.status,
//             paymentMethod: order.paymentMethod,
//             shipping: order.shipping,
//             orderId: order._id,
//             finalAmount: order.finalAmount,
//             invoiceDate: order.invoiceDate
//         }));

//         res.render('get-order', {
//             orders: formattedOrders,
//             totalPages: Math.ceil(totalOrders / limit),
//             currentPage: page
//         });

//     } catch (error) {
//         console.error("Error retrieving orders", error);
//         res.redirect('/pageNotFound');
//     }
// }

const getOrders = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const page = parseInt(req.query.page) || 1;
        const limit = 4;
        const skip = (page - 1) * limit;

        const orders = await Order.find({ userId: userId })
            .populate('productId')
            .sort({ createdOn: -1 })
            .skip(skip)
            .limit(limit)
            .exec();

        const totalOrders = await Order.countDocuments({ userId: userId });

        const formattedOrders = orders.map(order => ({
            productId: order.productId._id,
            productName: order.productId.productName,
            productImage: order.productId.productImage,
            quantity: order.quantity,
            price: order.price,
            totalPrice: order.totalPrice,
            discount: order.discount,
            address: order.address,
            status: order.status,
            paymentMethod: order.paymentMethod,
            shipping: order.shipping,
            orderId: order._id,
            finalAmount: order.finalAmount,
            invoiceDate: order.invoiceDate,
            cancellationReason: order.cancellationReason
        }));

        if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
            // If it's an AJAX request, return JSON
            res.json({
                orders: formattedOrders,
                totalPages: Math.ceil(totalOrders / limit),
                currentPage: page
            });
        } else {
            // Otherwise, render the full page
            res.render('get-order', {
                orders: formattedOrders,
                totalPages: Math.ceil(totalOrders / limit),
                currentPage: page
            });
        }
    } catch (error) {
        console.error("Error retrieving orders", error);
        res.redirect('/pageNotFound');
    }
};

const viewOrder = async (req, res) => {
    try {
        const userId = req.session.user;
        const { orderId } = req.params; 
        //console.log("Order ID:", orderId);

        const order = await Order.findOne({ _id: orderId })
            .populate("userId") 
            .populate({
                path: 'productId',
                populate: { path: 'category', select: 'name' }
            }).populate({
                path: 'productId',
                populate: { path: 'brand', select: 'brandName' }
            })
            .exec();
        //console.log("order",order);

        if (!order) {
            return res.redirect("/pageNotFound");
        }
        const addressDetails = await Address.findOne({ userId: order.userId }).exec();
   
        const address = addressDetails.address.find(
        (addr) => addr._id.toString() === order.address.toString()
        );


              if (!order.userId || !order.createdOn) {
                  return res.status(400).send("Missing required order details");
              }
    
              const orderItems = await Order.aggregate([
                {
                    $match: {
                        userId: new mongoose.Types.ObjectId(order.userId),
                        createdOn: {
                            $gte: order.createdOn,
                            $lt: new Date(order.createdOn.getTime() + 1000) 
                        },
                        productId: { $ne: new mongoose.Types.ObjectId(order.productId) }
                    }
                },
                {
                  $lookup: {
                      from: "products",
                      localField: "productId",
                      foreignField: "_id",
                      as: "productDetail"
                  }
              },
              {
                  $unwind: {
                      path: "$productDetail",
                      preserveNullAndEmptyArrays: true
                  }
              }
          ]);
              
        
        const trackingHistory = order.trackingHistory.sort((a, b) => new Date(a.date) - new Date(b.date));
        const latestTrackingEntry = trackingHistory[trackingHistory.length - 1];

        
        let expectedDeliveryDate = null;
        const shippedEntry = trackingHistory.find(entry => entry.status === "Shipped");
        if (shippedEntry) {
            expectedDeliveryDate = new Date(shippedEntry.date);
            expectedDeliveryDate.setDate(expectedDeliveryDate.getDate() + 3); 
        }

          
        res.render("viewOrder", { 
            order, 
            address, 
            orderItems: orderItems, 
            trackingHistory, 
            expectedDeliveryDate 
        });

    } catch (error) {
        console.error("Error fetching order details:", error);
        res.redirect("/pageNotFound");
    }
};

const cancelOrder = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { reason } = req.body;

        if (!orderId || !reason) {
            return res.json({ success: false, message: "Invalid request data" });
        }

        const order = await Order.findById(orderId);
        if (!order) {
            return res.json({ success: false, message: "Order not found" });
        }

        if (order.status === "Shipped") {
            return res.json({ success: false, message: "You cannot cancel shipped orders." });
        }

        if (order.status === "Delivered" || order.status === "Cancelled") {
            return res.json({ success: false, message: "Order is already delivered or cancelled." });
        }

        order.status = "Cancelled";
        order.trackingHistory.push({ date: new Date(), status: "Cancelled - " + reason });

        await order.save();

        return res.json({ success: true, message: "Order cancelled successfully." });
    } catch (error) {
        console.error("Error cancelling order:", error);
        return res.json({ success: false, message: "Internal server error." });
    }
};

module.exports = {
    getConfirmation,
    getOrders,
    viewOrder,
    cancelOrder
}