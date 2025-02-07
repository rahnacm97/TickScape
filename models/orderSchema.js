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
    productId: {
            type: Schema.Types.ObjectId,
            ref: "Product",
            required: true
    },
    quantity: {
            type: Number,
            required: true
    },
    price: {
            type: Number,
            default: 0
    },
    totalPrice: {
        type: Number,
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
        enum: ["Delivered","Shipped","Cancelled","Intransit","Processing"]
    },
    createdOn: {
        type: Date,
        default: Date.now,
        required: true
    },
    couponApplied: {
        type: Boolean,
        default: false
    },
    paymentMethod: {
        type: String,
        required: false,
        enum: ["Credit Card", "Online Payment","Wallet", "Cash on Delivery", "Bank Transfer"]
    }
})

const Order = mongoose.model("Order",orderSchema);
module.exports = Order;