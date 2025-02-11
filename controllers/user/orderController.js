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


// const viewOrder = async (req, res) => {
//   try {
//       const productId = req.params.productId;
//       //console.log("Product ID:", productId);
//       if (!productId) {
//           return res.status(400).send("Product ID is missing");
//       }
//       const order = await Order.aggregate([
//           {
//               $match: { productId: new mongoose.Types.ObjectId(productId) }
//           },
//           {
//               $lookup: {
//                   from: "products",
//                   localField: "productId",
//                   foreignField: "_id",
//                   as: "productDetails"
//               }
//           },
//           { $unwind: { path: "$productDetails", preserveNullAndEmptyArrays: true } },

//           {
//               $lookup: {
//                   from: "brands",
//                   localField: "productDetails.brand",
//                   foreignField: "_id",
//                   as: "brandDetails"
//               }
//           },
//           { $unwind: { path: "$brandDetails", preserveNullAndEmptyArrays: true } },

//           {
//               $lookup: {
//                   from: "addresses",
//                   localField: "address",
//                   foreignField: "address._id",
//                   as: "addressDetails"
//               }
//           },
//           { $unwind: { path: "$addressDetails", preserveNullAndEmptyArrays: true } },

//           {
//               $addFields: {
//                   addressDetails: {
//                       $arrayElemAt: [
//                           {
//                               $filter: {
//                                   input: "$addressDetails.address",
//                                   as: "addr",
//                                   cond: { $eq: ["$$addr._id", "$address"] }
//                               }
//                           },
//                           0
//                       ]
//                   }
//               }
//           },

//           {
//               $lookup: {
//                   from: "categories",
//                   localField: "productDetails.category",
//                   foreignField: "_id",
//                   as: "categoryDetails"
//               }
//           },
//           { $unwind: { path: "$categoryDetails", preserveNullAndEmptyArrays: true } }
//       ]);

//       if (!order || order.length === 0) {
//           return res.status(404).send("Order not found");
//       }

//       //console.log("Order Data:", order[0]);

//       const { userId, createdOn, productId: currentProductId } = order[0];

//       if (!userId || !createdOn) {
//           return res.status(400).send("Missing required order details");
//       }

//       // Fetch all orders of the same user created at the same time, EXCLUDING the current product
//       const orderItems = await Order.aggregate([
//         {
//             $match: {
//                 userId: new mongoose.Types.ObjectId(userId),
//                 createdOn: {
//                     $gte: createdOn,
//                     $lt: new Date(createdOn.getTime() + 1000) // Adds 1 second
//                 },
//                 productId: { $ne: new mongoose.Types.ObjectId(currentProductId) } // Exclude the current product
//             }
//         },
//         {
//           $lookup: {
//               from: "products", // The name of the collection in MongoDB
//               localField: "productId",
//               foreignField: "_id",
//               as: "productDetail"
//           }
//       },
//       {
//           $unwind: {
//               path: "$productDetail",
//               preserveNullAndEmptyArrays: true
//           }
//       }
//   ]);
      

//       //console.log("Matching Orders (Excluding Current Product):", orderItems);   
      
//       order[0].trackingHistory = [
//         { date: '2025-01-01', status: 'Order Placed' },
//         { date: '2025-01-03', status: 'Processing' },
//         { date: '2025-01-05', status: 'Shipped' },
//         { date: '2025-01-07', status: 'Out for Delivery' },
//         { date: '2025-01-08', status: 'Delivered' }
//       ];

//       res.render("viewOrder", {
//           order: order[0], 
//           user: req.session.user,
//           orderItems: orderItems,
//       });

//      // console.log("matchingOrder",orderItems);


//   } catch (error) {
//       console.error("Error fetching order:", error);
//       res.status(500).send("Error loading the page");
//   }
// };


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
        
              // Fetch all orders of the same user created at the same time, EXCLUDING the current product
              const orderItems = await Order.aggregate([
                {
                    $match: {
                        userId: new mongoose.Types.ObjectId(order.userId),
                        createdOn: {
                            $gte: order.createdOn,
                            $lt: new Date(order.createdOn.getTime() + 1000) // Adds 1 second
                        },
                        productId: { $ne: new mongoose.Types.ObjectId(order.productId) } // Exclude the current product
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

        // Expected delivery date: 2-5 days after "Shipped" status
        let expectedDeliveryDate = null;
        const shippedEntry = trackingHistory.find(entry => entry.status === "Shipped");
        if (shippedEntry) {
            expectedDeliveryDate = new Date(shippedEntry.date);
            expectedDeliveryDate.setDate(expectedDeliveryDate.getDate() + 3); // Approximate delivery in 3 days
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

// const cancelOrder = async (req, res) => {
//   try {
//       console.log("111111111111");
//       const { orderId } = req.params;
//       const { reason } = req.body;

//       console.log("Cancelling Order ID:", orderId);

//       if (!reason) {
//           return res.status(400).json({ success: false, message: "Cancellation reason is required" });
//       }
//       console.log("222222222222");
//       console.log("reason",reason);

//       // Find the order and populate the product details
//       const order = await Order.findOne({ _id: orderId }).populate('productId');
//       console.log("order",order);

//       console.log("3");
//       if (!order) {
//           return res.status(404).json({ success: false, message: "Order not found" });
//       }
//       console.log("4");

//       // Check if the order is already shipped or delivered
//       if (["Shipped", "Delivered"].includes(order.status)) {
//           return res.status(400).json({ success: false, message: "Order cannot be cancelled after shipment" });
//       }
//       console.log("5");

//       const product = order.productId; 
//       if (product) {
//           product.quantity += order.quantity; // Restore stock
//           console.log(`Restoring ${order.quantity} units for product: ${product.productName}`);
//           await product.save();
//       } else {
//           console.error("Product not found:", order.productId);
//       }

//       console.log("6");

//       // Update order status and add cancellation reason
//       order.status = "Cancelled";
//       order.cancellationReason = reason; // Store the reason
//       await order.save();
//       console.log("7");

//       res.json({ success: true, message: "Order cancelled and stock updated successfully" });
//   } catch (error) {
//       console.error("Error cancelling order:", error);
//       res.status(500).json({ success: false, message: "Internal Server Error" });
//   }
// };
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

        // Update order status and add cancellation reason
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
    viewOrder,
    cancelOrder
}