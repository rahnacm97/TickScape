const mongoose = require('mongoose');
const {Schema} = mongoose;
const {v4:uuidv4} = require('uuid');

const orderSchema = new Schema({
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    orderId: {
        type: String,
        default: () => uuidv4(),
        unique: true
    },
    orderedItems:[{
    productId: {
            type: Schema.Types.ObjectId,
            ref: "Product",
            required: true
    },
    productName: { type: String, required: true }, 
    productImage: { type: String, required: true }, 
    quantity: {
            type: Number,
            required: true
    },
    price: {
            type: Number,
            default: 0
    },
    orderStatus: {
        type: String,
        required: true,
        default: 'Order Placed',
        enum: ['Order Placed', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered','Cancelled', 'Return request', 'Returned',`Return Denied`],      
    },
    returnReason: {
        type: String,
        default: null
    }
    }],
    totalPrice: {
        type: Number,
        required: true
    },
    gstAmount: { 
        type: Number,
        default: 0,
        required: true
    },
    discount: {
        type: Number,
        default: 0
    },
    shipping: {
        type: Number,
        default: 0
    },
    finalAmount: {
        type: Number,
        required: true
    },
    address: {
        type: Schema.Types.ObjectId,
        ref: 'Address',
        required: true
    },
    invoiceDate: {
        type: Date,
        default: Date.now
    },
    status: {
        type: String,
        required: true,
        default: 'Order Placed',
        enum: ['Payment Pending','Order Placed', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered','Cancelled', 'Return request', 'Returned', `Return Denied`],      
    },
    createdOn: {
        type: Date,
        // default: Date.now,
        default: () => new Date().toISOString().slice(0, 19) + "Z",
        required: true
    },
    couponApplied: {
        type: Boolean,
        default: false
    },
    appliedCoupon: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: "Coupon" 
    },
    paymentMethod: {
        type: String,
        required: false,
        enum: ["Wallet", "Cash on Delivery", "Online Payment"]
    },
    paymentInfo: { 
        paymentId: { type: String, default: null }, 
        status: { 
            type: String, 
            enum: ['Pending', 'Success', 'Failed'], 
            default: 'Pending' 
        },
        attempts: { type: Number, default: 0 }, 
        lastAttempted: { type: Date, default: null },
    },
    cancellationReason: {
        type: String,
        default: null
    },
    trackingHistory: [
        {
            date: { type: Date, default: Date.now },
            status: { type: String, required: true }
        }
    ]
})

const Order = mongoose.model("Order",orderSchema);
module.exports = Order;