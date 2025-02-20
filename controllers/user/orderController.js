const User = require("../../models/userSchema");
const Category = require("../../models/categorySchema");
const Product = require("../../models/productSchema");
const Address = require("../../models/addressSchema");
const Cart = require("../../models/cartSchema");
const Order = require("../../models/orderSchema");
const Review = require("../../models/reviewSchema");
const env = require("dotenv").config();
const session = require("express-session");
const mongoose = require('mongoose');

const getConfirmation = async (req, res) => {
    try {
        const { orderId } = req.query;
        const userId = req.session.user._id;

        console.log("Order ID received:", orderId);
        console.log("User ID from session:", userId);

        if (!orderId) {
            return res.status(400).json({ error: "Order ID is required" });
        }
        const order = await Order.findById(orderId)
            .populate({
                path: "orderedItems.productId",
                model: "Product",
            });

        if (!order) {
            return res.status(404).json({ error: "Order not found" });
        }

        //console.log("Order address:", order.address);

        let fullAddress = null;
        if (order.address) {
            const addressDoc = await Address.findOne({ userId });
            //console.log(addressDoc);

            if (!addressDoc) {
                return res.status(404).json({ error: "Address document not found." });
            }

            fullAddress = addressDoc.address.find(addr => addr._id.toString() === order.address.toString());

            if (!fullAddress) {
                return res.status(404).json({ error: "Address not found." });
            }

            console.log("Selected Address:", fullAddress);
        }

        res.render("orders", {
            orders: order,
            user: req.session.user,
            address: fullAddress, 
        });

    } catch (error) {
        console.error("Error fetching order confirmation:", error);
        res.status(500).send("Error loading the page");
    }
};

const getOrders = async (req, res) => {
    try {
        const userId = req.session?.user?._id;
        if (!userId) {
            return res.status(401).json({ error: "Unauthorized access" });
        }

        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = 4;
        const skip = (page - 1) * limit;

        const [orders, totalOrders] = await Promise.all([
            Order.find({ userId })
                .sort({ createdOn: -1 })
                .skip(skip)
                .limit(limit)
                .populate({
                    path: "orderedItems.productId",
                })
                .lean(),
            Order.countDocuments({ userId })
        ]);

        const formattedOrders = orders.map(order => ({
            orderid: order._id,
            totalPrice: order.totalPrice,
            discount: order.discount,
            finalAmount: order.finalAmount,
            address: order.address,
            status: order.status,
            paymentMethod: order.paymentMethod,
            shipping: order.shipping,
            invoiceDate: order.invoiceDate,
            cancellationReason: order.cancellationReason,
            orderedItems: order.orderedItems.map(item => ({
                productId: item.productId._id,
                name: item.productId.productName,
                price: item.productId.salePrice,
                quantity: item.quantity,
                image: item.productId.productImage,
                orderStatus: item.productId.orderStatus,
            }))
        }));

        if (req.xhr) {
            return res.json({
                orders: formattedOrders,
                totalPages: Math.ceil(totalOrders / limit),
                currentPage: page
            });
        }
    
            res.render('get-order', {
                orders: formattedOrders,
                totalPages: Math.ceil(totalOrders / limit),
                currentPage: page
            });
            //console.log("order",formattedOrders);

    } catch (error) {
        console.error("Error retrieving orders:", error.message);
        res.redirect('/pageNotFound');
    }
};


const viewOrder = async(req,res) => {
    try {
        const userId = req.session.user._id;
        const { orderid } = req.params;
        console.log("1",orderid,userId);

        const order = await Order.findById(orderid).populate({
            path: 'orderedItems.productId', 
            model: 'Product'
        }).lean();

        if (!order) {
            return res.status(404).send('Order not found');
        }
        
        console.log("1", order);
        const addressDetails = await Address.findOne({ userId: order.userId }).exec();
   
        const address = addressDetails.address.find(
        (addr) => addr._id.toString() === order.address.toString()
        );

        const trackingHistory = order.trackingHistory ? order.trackingHistory.sort((a, b) => {
        return new Date(a.date) - new Date(b.date);
       })
        : [];

        console.log("Sorted Tracking History:", trackingHistory);

        const latestTrackingEntry = trackingHistory.length > 0 ? trackingHistory[trackingHistory.length - 1] : null;
        
        let expectedDeliveryDate = null;
        if (trackingHistory.some(entry => entry.status === "Processing")) {
            const processingEntry = trackingHistory.find(entry => entry.status === "Processing");
            expectedDeliveryDate = new Date(processingEntry.date);
            expectedDeliveryDate.setDate(expectedDeliveryDate.getDate() + 6);
        }

        res.render("viewOrder", { 
            order,
            user:req.session.user,
            address,
            trackingHistory, 
            expectedDeliveryDate,
            orderItems: order.orderedItems,
        });

    } catch (error) {
        console.error("Error fetching order details:", error);
        res.redirect("/pageNotFound");
    }
}


const cancelOrder = async (req, res) => {
    try {
        const { itemId } = req.params;
        const { reason } = req.body;

        if (!itemId || !reason) {
            return res.status(400).json({ success: false, message: "Invalid request data" });
        }

        const order = await Order.findOne({ "orderedItems.productId": itemId });
        if (!order) {
            return res.status(404).json({ success: false, message: "Order item not found" });
        }

        console.log("Order found:", order);
        console.log("Ordered items:", order.orderedItems);

        const itemIndex = order.orderedItems.findIndex(item => item.productId.toString() === itemId);
        if (itemIndex === -1) {
            return res.status(404).json({ success: false, message: "Item not found in order" });
        }

        const item = order.orderedItems[itemIndex];

        if (["Shipped", "Out for Delivery", "Delivered", "Cancelled"].includes(item.orderStatus)) {
            return res.status(400).json({ success: false, message: `You cannot cancel a ${item.orderStatus} item.` });
        }

        item.orderStatus = "Cancelled";
        item.cancellationReason = reason;

        await Product.updateOne(
            { _id: item.productId },
            { $inc: { quantity: item.quantity } }
        );

        order.totalPrice -= item.price * item.quantity;
        order.finalAmount = order.totalPrice - order.discount + order.shipping;

        const allItemsCancelled = order.orderedItems.every(i => i.orderStatus === "Cancelled");
        if (allItemsCancelled) {
            order.status = "Cancelled";
            order.finalAmount = 0; 
        }

        //order.cancellationReason.push({ date: new Date(), status: `${reason}` });

        await order.save();

        return res.status(200).json({ success: true, message: "Item cancelled successfully." });
    } catch (error) {
        console.error("Error cancelling order item:", error);
        return res.status(500).json({ success: false, message: "Internal server error." });
    }
};


const cancelParentOrder = async (req, res) => {
    try {
        const { OrderId } = req.params;
        const { reason } = req.body;

        if (!OrderId || !reason) {
            return res.json({ success: false, message: "Invalid request data." });
        }

        console.log("OrderId:", OrderId);
        const orders = await Order.findById(OrderId);

        console.log("Orders found:", orders);

        if (!orders) {
            return res.json({ success: false, message: "Parent order not found." });
        }

        const isShippedOrDelivered = orders.orderedItems.some(
            (item) =>
                item.orderStatus === "Shipped" ||
                item.orderStatus === "Delivered" ||
                item.orderStatus === "Out for Delivery"
        );

        if (isShippedOrDelivered) {
            return res.json({
                success: false,
                message:
                    "One or more items in this order have already been shipped, delivered, or are out for delivery. Cancellation is not allowed.",
            });
        }

        for (const item of orders.orderedItems) {
            if (item.orderStatus !== "Cancelled") {
                const product = await Product.findById(item.productId);
                if (product) {
                    console.log("Product before update:", product);
                    await Product.updateOne(
                        { _id: item.productId },
                        { $inc: { quantity: item.quantity } } 
                    );
                    console.log("Product after update:", product);
                }

                item.orderStatus = "Cancelled";
            }
        }

        orders.status = "Cancelled";
        orders.finalAmount = 0;
        orders.trackingHistory.push({ date: new Date(), status: "Cancelled - " + reason });

        await orders.save();

        console.log("Order after update:", orders);

        return res.json({
            success: true,
            message: "All eligible items under the parent order have been cancelled successfully.",
        });
    } catch (error) {
        console.error("Error cancelling parent order:", error);
        return res.json({ success: false, message: "Internal server error." });
    }
};


const getWriteReview = async(req,res) => {
    try {
        const { productId, orderId } = req.query;

        if (!productId && !orderId) {
            return res.status(400).send("Product ID and Order ID is required");
        }

        res.render('writeReview', { productId, orderId }); 
    } catch (error) {
        console.error("Error processing orders:", error);
        res.status(500).send("Error loading the page");
    }
}

const submitReview = async (req, res) => {
    const { productId, orderId, rating, comment } = req.body;
    const userId = req.session.user._id;

    try {
       
        const productExists = await Product.findById(productId);
        if (!productExists) return res.status(404).send("Product not found");


        if (!userId) return res.status(401).send("User not authenticated");

        const review = new Review({
            productId,
            user: userId,
            rating: parseInt(rating),
            comment
        });

        await review.save();

        res.json({ 
            success: true, 
            message: "Review submitted successfully!", 
            orderId: orderId 
        });
        
    } catch (error) {
        console.error("Error submitting review:", error);
        res.status(500).send("Error submitting review");
    }
};

const getUpdateAddress = async (req, res) => {
    try {
        const orderid = req.query.orderid;
        const userId = req.session.user._id;

        if (!orderid) { 
            return res.status(400).send("Invalid Order ID");
        }

        const order = await Order.findById(orderid);

        const restrictedStatuses = ["Shipped", "Out for Delivery", "Delivered", "Cancelled"];
        if (restrictedStatuses.includes(order.status)) {
            console.error("Address change not allowed for this order status:", order.status);
            return res.status(403).send("Shipping address cannot be changed at this stage.");
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

        if (!order) {
            return res.status(404).send("Order not found!");
        }
        console.log("address",address);

        res.render('update-address', { 
            order,
            address,
         }); 

    } catch (error) {
        console.error("Error rendering update address page:", error);
        res.status(500).send("Internal Server Error");
    }
};


const updateAddress = async (req, res) => {
    try {
        const orderid = req.query.orderid;
        const userId = req.session.user._id;
        console.log("Order ID received:", orderid);

        if (!mongoose.Types.ObjectId.isValid(orderid)) {
            return res.status(400).json({ error: "Invalid Order ID format" });
        }

        const order = await Order.findById(orderid);
        if (!order) {
            return res.status(404).json({ error: "Order not found!" });
        }

        const restrictedStatuses = ["Shipped", "Out for Delivery", "Delivered"];
        if (restrictedStatuses.includes(order.status)) {
            return res.status(403).json({ error: "Shipping address cannot be changed at this stage." });
        }

        const { addressType, name, city, landMark, state, pincode, phone, altPhone } = req.body;

        order.address = {
            addressType,
            name,
            city,
            landMark,
            state,
            pincode,
            phone,
            altPhone,
        };

        await order.save();

        res.status(200).json({ 
            message: "Address updated successfully!", 
            updatedOrder: order, 
            redirectUrl
        });
    } catch (error) {
        console.error("Error updating address:", error);
        res.status(500).json({ error: "Failed to update address." });
    }
};



module.exports = {
    getConfirmation,
    getOrders,
    viewOrder,
    cancelOrder,
    cancelParentOrder,
    getWriteReview,
    submitReview,
    getUpdateAddress,
    updateAddress
}