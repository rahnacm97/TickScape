const User = require("../../models/userSchema");
const Category = require("../../models/categorySchema");
const Product = require("../../models/productSchema");
const Address = require("../../models/addressSchema");
const Cart = require("../../models/cartSchema");
const Order = require("../../models/orderSchema");
const Review = require("../../models/reviewSchema");
const Coupon = require("../../models/couponSchema");
const env = require("dotenv").config();
const session = require("express-session");
const mongoose = require('mongoose');
//const PDFDocument = require("pdfkit");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const PDFTable = require("pdfkit-table");

//Confirmation page
const getConfirmation = async (req, res) => {
    try {
        const orderId = req.query.orderId; // Sequential number from frontend
        console.log("Received orderId:", orderId);
        const userId = req.session.user;        
        //const order = await Order.findOne({ orderId: parseInt(orderId) });
        
        //console.log("Order ID received:", orderId);
        //console.log("User ID from session:", userId);

        const user = await User.findById({_id:userId});

        if (!orderId) {
            return res.status(400).json({ error: "Order ID is required" });
        }
        const order = await Order.findOne({ orderId: orderId })
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

           // console.log("Selected Address:", fullAddress);
        }

        res.render("orders", {
            orders: order,
            user: user,
            address: fullAddress, 
        });

    } catch (error) {
        console.error("Error fetching order confirmation:", error);
        res.status(500).send("Error loading the page");
    }
};

//Invoice
const downloadInvoice = async (req, res) => {
    try {
        const { orderId } = req.params;
        const userId = req.session.user;

        const order = await Order.findById(orderId).populate({
            path: "orderedItems.productId",
            model: "Product",
        });

        if (!order) {
            return res.status(404).json({ error: "Order not found" });
        }
        //console.log("order",order.orderedItems);

        let fullAddress = null;
        if (order.address) {
            const addressDoc = await Address.findOne({ userId });

            if (!addressDoc) {
                return res.status(404).json({ error: "Address document not found." });
            }

            fullAddress = addressDoc.address.find(
                (addr) => addr._id.toString() === order.address.toString()
            );

            if (!fullAddress) {
                return res.status(404).json({ error: "Address not found." });
            }
        }

        const invoiceDir = path.join("D:", "BROTOTYPE", "TICKSCAPE", "invoices");
        const invoicePath = path.join(invoiceDir, `invoice-${orderId}.pdf`);

        if (!fs.existsSync(invoiceDir)) {
            fs.mkdirSync(invoiceDir, { recursive: true });
        }

        const doc = new PDFTable({ margin: 30, size: "A4" }); 
        const writeStream = fs.createWriteStream(invoicePath);
        doc.pipe(writeStream);

        // === Header ===
        doc.fontSize(20).text("Invoice", { align: "center" }).moveDown();

        // Order ID and Date
        doc.fontSize(12).text(`Order ID: ${order.orderId}`);
        doc.text(`Date: ${new Date(order.createdOn).toLocaleDateString()}`).moveDown();

        // Delivery Address
        doc.fontSize(12).text("Deliver to:", { underline: true });
        doc.text(`${fullAddress.name}`);
        doc.text(`${fullAddress.addressType}, ${fullAddress.city}, ${fullAddress.state}, ${fullAddress.landMark}`);
        doc.text(`Pincode: ${fullAddress.pincode}`);
        doc.text(`Phone: ${fullAddress.phone}, ${fullAddress.altPhone}`).moveDown();

        // === Table ===
        const table = {
            title: "Order Details",
            headers: ["#", "Product Name", "Quantity", "Price", "Total" ,"Status"],
            rows: order.orderedItems.map((item, index) => [
                index + 1, // # (Index)
                item.productId.productName, // Product Name
                item.quantity.toString(), // Quantity
                `₹${item.price}`, // Price
                `₹${(item.quantity * item.price * 1.18).toFixed(2)}`,
                item.orderStatus, // Total
            ]), 
        };

        console.log("Table Rows:", table.rows);

        doc.registerFont("NotoSans", path.join(invoiceDir, "fonts" , "Noto_Sans", "static", "NotoSans-Regular.ttf"));
        doc.font("NotoSans");
        
        // Add the table to the PDF
        await doc.table(table, {
            columnsSize: [50, 150, 80, 80, 80, 100],
            prepareHeader: () => doc.font("NotoSans").fontSize(12),
            prepareRow: (row, indexColumn, indexRow, rectRow) => {
                doc.font("NotoSans");
            },
        });

        //console.log('table data',table);

        // === Summary Section ===
        doc.moveDown().fontSize(12);
        const cgst = (order.totalPrice * 0.09).toFixed(2);
        const sgst = (order.totalPrice * 0.09).toFixed(2);

        doc.text(`Products Price: ₹${(order.totalPrice).toFixed(2)}`, { align: "right" });
        doc.text(`CGST (9%): ₹${cgst}`, { align: "right" });
        doc.text(`SGST (9%): ₹${sgst}`, { align: "right" });
        doc.text(`Total GST (18%): ₹${(order.gstAmount).toFixed(2)}`, { align: "right" });
        doc.text(`Shipping: ₹${(order.shipping).toFixed(2)}`, { align: "right" });
        doc.text(`Discount: ₹${(order.discount).toFixed(2)}`, { align: "right" });
        doc.fontSize(14).text(`Final Amount: ₹${(order.finalAmount).toFixed(2)}`, { align: "right", underline: true });

        // Footer
        doc.moveDown().fontSize(12).text("Thank you for shopping with us!", { align: "center" });

        doc.end();

        // Handle file download
        writeStream.on("finish", () => {
            console.log("PDF successfully written. Ready for download.");

            fs.access(invoicePath, fs.constants.F_OK, (err) => {
                if (err) {
                    console.error("File does not exist:", invoicePath);
                    return res.status(404).json({ error: "Invoice file not found" });
                }

                console.log("File exists, proceeding to download...");

                res.download(invoicePath, `invoice-${orderId}.pdf`, (err) => {
                    if (err) {
                        console.error("Error downloading invoice:", err);
                        return res.status(500).json({ error: "Error downloading invoice" });
                    } else {
                        console.log("Invoice downloaded successfully.");
                    }
                });
            });
        });
    } catch (error) {
        console.error("Error generating invoice:", error);
        res.status(500).json({ error: "Error generating invoice" });
    }
};

//Orders in profile
const getOrders = async (req, res) => {
    try {
        const userId = req.session?.user;
        if (!userId) {
            return res.status(401).json({ error: "Unauthorized access" });
        }

        const user = await User.findById({_id:userId});

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
            orderId: order.orderId,
            totalPrice: order.totalPrice,
            discount: order.discount,
            gstAmount: order.gstAmount,
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
                currentPage: page,
                user: user
            });
            //console.log("order",formattedOrders);

    } catch (error) {
        console.error("Error retrieving orders:", error.message);
        res.redirect('/pageNotFound');
    }
};

//View single order
const viewOrder = async(req,res) => {
    try {

        const userId = req.session.user;
        const { orderid } = req.params;
        //console.log("1",orderid,userId);

        const user = await User.findById({_id:userId});

        const order = await Order.findById(orderid).populate({
            path: 'orderedItems.productId', 
            model: 'Product'
        }).lean();

        if (!order) {
            return res.status(404).send('Order not found');
        }
        
        //console.log("1", order);
        const addressDetails = await Address.findOne({ userId: order.userId }).exec();
   
        const address = addressDetails.address.find(
        (addr) => addr._id.toString() === order.address.toString()
        );

        const trackingHistory = order.trackingHistory ? order.trackingHistory.sort((a, b) => {
        return new Date(a.date) - new Date(b.date);
        }): [];

       // console.log("Sorted Tracking History:", trackingHistory);

        const latestTrackingEntry = trackingHistory.length > 0 ? trackingHistory[trackingHistory.length - 1] : null;
        
        let expectedDeliveryDate = null;
        if (trackingHistory.some(entry => entry.status === "Processing")) {
            const processingEntry = trackingHistory.find(entry => entry.status === "Processing");
            expectedDeliveryDate = new Date(processingEntry.date);
            expectedDeliveryDate.setDate(expectedDeliveryDate.getDate() + 6);
        }

        res.render("viewOrder", { 
            order,
            user: user,
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

//Cancel single item from order
const cancelOrder = async (req, res) => {
    try {
      const { itemId } = req.params;
      const { reason } = req.body;
  
      if (!itemId || !reason) {
        return res.status(400).json({ success: false, message: "Invalid request data" });
      }
  
      const order = await Order.findOne({ "orderedItems._id": itemId });
      if (!order) {
        return res.status(404).json({ success: false, message: "Order item not found" });
      }
  
      const itemIndex = order.orderedItems.findIndex(item => item._id.toString() === itemId);
      if (itemIndex === -1) {
        return res.status(404).json({ success: false, message: "Item not found in order" });
      }
  
      const item = order.orderedItems[itemIndex];
      if (["Shipped", "Out for Delivery", "Delivered", "Cancelled"].includes(item.orderStatus)) {
        return res.status(400).json({ success: false, message: `You cannot cancel a ${item.orderStatus} item.` });
      }
  
      item.orderStatus = "Cancelled";
      item.cancellationReason = reason;
  
      await Product.updateOne({ _id: item.productId }, { $inc: { quantity: item.quantity } });
  
      let walletCredit = 0;
      const originalShipping = 50; 
      const gstRate = 18;
      const itemBasePrice = item.price * item.quantity;
      const itemPriceWithGST = itemBasePrice + (itemBasePrice * (gstRate / 100));
      const totalItems = order.orderedItems.length;
  
      if (order.paymentMethod !== "Cash on Delivery") {
        walletCredit = itemPriceWithGST;
  
        if (order.couponApplied && order.discount > 0) {
          const activeTotalPrice = order.orderedItems
            .filter(i => i.orderStatus !== "Cancelled" || i._id.toString() === itemId)
            .reduce((sum, i) => sum + (i.price * i.quantity), 0);
          const discountPerItem = (itemBasePrice / activeTotalPrice) * order.discount;
          walletCredit -= discountPerItem;
          order.discount -= discountPerItem.toFixed(2); 
        }
  
        const shippingShare = originalShipping / totalItems;
        walletCredit += shippingShare;
        order.shipping = (Math.max(0, order.shipping - shippingShare)).toFixed(2);
  
        const walletCreditRounded = parseFloat(walletCredit.toFixed(2));
        if (walletCreditRounded > 0) {
          await User.updateOne(
            { _id: order.userId },
            { $push: { wallet: { amount: walletCreditRounded, date: new Date(), reason: "Refund" } } }
          );
        }
      }
  
      order.totalPrice -= itemBasePrice;
      order.gstAmount = order.totalPrice * (gstRate / 100);
      order.finalAmount = order.totalPrice + order.gstAmount - order.discount + order.shipping;
  
      const allItemsCancelled = order.orderedItems.every(i => i.orderStatus === "Cancelled");
      if (allItemsCancelled) {
        order.status = "Cancelled";
        order.finalAmount = 0;
        order.shipping = 0;
        order.discount = 0;
      }
  
      await order.save();
  
      return res.status(200).json({
        success: true,
        message: "Order cancelled successfully.",
        walletCredit: walletCredit > 0 ? walletCredit.toFixed(2) : 0
      });
    } catch (error) {
      console.error("Error cancelling order item:", error);
      return res.status(500).json({ success: false, message: "Internal server error." });
    }
};

//Whole order cancel
const cancelParentOrder = async (req, res) => {
    try {
      const { OrderId } = req.params;
      const { reason } = req.body;
  
      if (!OrderId || !reason) {
        return res.status(400).json({ success: false, message: "Invalid request data." });
      }
  
      const order = await Order.findById(OrderId);
      if (!order) {
        return res.status(404).json({ success: false, message: "Parent order not found." });
      }
  
      const isShippedOrDelivered = order.orderedItems.some(item =>
        ["Shipped", "Delivered", "Out for Delivery"].includes(item.orderStatus)
      );
      if (isShippedOrDelivered) {
        return res.status(400).json({
          success: false,
          message: "One or more items have already been shipped, delivered, or are out for delivery."
        });
      }
  
      let refundAmount = 0;
      if (order.paymentMethod !== "Cash on Delivery") {
        refundAmount = order.finalAmount; // Full amount post-adjustments
      }
  
      const user = await User.findById(order.userId);
      if (!user) {
        return res.status(404).json({ success: false, message: "User not found." });
      }
  
      if (refundAmount > 0) {
        await User.updateOne(
          { _id: user._id },
          { $push: { wallet: { amount: parseFloat(refundAmount.toFixed(2)), date: new Date(), reason: "Refund" } } }
        );
      }
  
      for (const item of order.orderedItems) {
        if (item.orderStatus !== "Cancelled") {
          await Product.updateOne({ _id: item.productId }, { $inc: { quantity: item.quantity } });
          item.orderStatus = "Cancelled";
        }
      }
  
      order.status = "Cancelled";
      order.finalAmount = 0;
      order.trackingHistory.push({ date: new Date(), status: "Cancelled - " + reason });
  
      await order.save();
  
      return res.status(200).json({
        success: true,
        message: "Order cancelled successfully.",
        refundAmount: refundAmount > 0 ? refundAmount.toFixed(2) : 0
      });
    } catch (error) {
      console.error("Error cancelling parent order:", error);
      return res.status(500).json({ success: false, message: "Internal server error." });
    }
};

//review write page
const getWriteReview = async(req,res) => {
    try {
        const { productId, orderId } = req.query;
        const userId = req.session.user;

        const user = await User.findById({_id:userId});

        if (!productId && !orderId) {
            return res.status(400).send("Product ID and Order ID is required");
        }

        res.render('writeReview', { productId, orderId ,user}); 
    } catch (error) {
        console.error("Error processing orders:", error);
        res.status(500).send("Error loading the page");
    }
}

//Review
const submitReview = async (req, res) => {
    const { productId, orderId, rating, comment } = req.body;
    const userId = req.session.user;

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

//Return order request
const returnOrder = async (req, res) => {
    try {
      const { orderId, productId, returnReason } = req.body;
      console.log("Requesting return:", { orderId, productId, returnReason });
  
      if (!orderId || !productId || !returnReason) {
        return res.status(400).json({ success: false, message: "Missing required fields" });
      }
  
      const order = await Order.findById(orderId).populate("userId").exec();
      if (!order) {
        return res.status(404).json({ success: false, message: "Order not found" });
      }
  
      const productItem = order.orderedItems.find(
        item => item.productId.equals(productId) // Use .equals() for ObjectId
      );
  
      if (!productItem) {
        return res.status(404).json({ success: false, message: "Product not found in the order" });
      }
  
      if (productItem.orderStatus === "Return request" || productItem.orderStatus === "Returned") {
        return res.status(400).json({ success: false, message: "Return already requested or completed" });
      }
  
      if (productItem.orderStatus !== "Delivered") {
        return res.status(400).json({
          success: false,
          message: `Cannot request return: Item status is "${productItem.orderStatus}", expected "Delivered"`
        });
      }
  
      productItem.orderStatus = "Return request";
      productItem.returnReason = returnReason;
      productItem.returnRequestedDate = new Date();
      order.status = "Return request";
  
      await order.save();
      console.log("Updated order:", order);
  
      res.status(200).json({
        success: true,
        message: "Return request processed successfully",
      });
  
    } catch (error) {
      console.error("Error processing return:", error);
      res.status(500).json({ success: false, message: "Could not process return request" });
    }
  };

const razorpayInstance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});
  
//Retry failed payment
const retryPayment = async (req, res) => {
    try {
      const { orderId } = req.params;
      console.log("1",orderId);
      const order = await Order.findById(orderId).populate("orderedItems.productId");
      console.log("order",order);
  
      if (!order || order.status !== "Payment Pending") {
        return res.status(400).json({ success: false, message: "Invalid order or status." });
      }

      const finalAmount = order.finalAmount;
      console.log("final", finalAmount);
  
      const finalAmountPaise = Math.round(finalAmount * 100);      
      const options = { amount: finalAmountPaise, currency: "INR" }; 
      console.log("options",options);
      console.log("final",finalAmount);
      const razorpayOrder = await razorpayInstance.orders.create(options);
      console.log("razorpay",razorpayOrder);
  
      if (!razorpayOrder || !razorpayOrder.id) {
        throw new Error("Failed to create Razorpay order.");
      }
  
      // Optionally update paymentInfo with the new transactionId
      order.paymentInfo.transactionId = razorpayOrder.id;
      await order.save();

      console.log("Order updated with payment info");
  
      res.status(200).json({
        success: true,
        order: razorpayOrder,
      });
    } catch (error) {
        const errorMessage = error.message || 'Unknown error occurred';
        const errorStack = error.stack || new Error().stack;
      console.error("Retry Payment Error:", error.message, error.stack);
      res.status(500).json({ success: false, message: error.message });
    }
};

//Failed payment verification
const verifyRetryPayment = async (req, res) => {
  try {
    const { order_id, payment_id, signature, orderId } = req.body;

    if (!process.env.RAZORPAY_KEY_SECRET) {
      return res.status(500).json({ success: false, message: "Server error: Payment configuration missing." });
    }

    // Verify payment signature
    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(order_id + "|" + payment_id)
      .digest("hex");

    if (generatedSignature !== signature) {
      return res.status(400).json({ success: false, message: "Payment verification failed." });
    }

    // Fetch the order
    const order = await Order.findById(orderId).populate("orderedItems.productId");
    if (!order || order.status !== "Payment Pending") {
      return res.status(400).json({ success: false, message: "Invalid order or status." });
    }

    // Deduct product quantities
    for (const item of order.orderedItems) {
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

    // Update payment and order status
    order.paymentInfo.status = "Success";
    order.paymentInfo.paymentId = payment_id;
    order.paymentInfo.lastAttempted = new Date();
    order.status = "Order Placed"; // Update order status
    order.trackingHistory.push({ status: "Order Placed", date: new Date() }); // Update tracking history

    // Save the updated order
    const updatedOrder = await order.save();

    res.status(200).json({
      success: true,
      message: "Payment verified successfully",
      order: updatedOrder,
    });
  } catch (error) {
    console.error("Verify Retry Payment Error:", error.message, error.stack);
    res.status(500).json({ success: false, message: error.message });
  }
};


module.exports = {
    getConfirmation,
    downloadInvoice,
    getOrders,
    viewOrder,
    cancelOrder,
    cancelParentOrder,
    getWriteReview,
    submitReview,
    returnOrder,
    retryPayment,
    verifyRetryPayment
}