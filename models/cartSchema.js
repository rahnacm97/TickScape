const mongoose = require('mongoose');
const {Schema} = mongoose;

const cartSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        refer:'User',
        required:true
    },
    items: [{
        productId: {
            type: Schema.Types.ObjectId,
            ref: 'Product',
            required: true
        },
        quantity: {
            type: Number,
            default: 1,
            min: [1, 'Quantity must be at least 1']
        },
        totalPrice: {
            type: Number,
            required: true
        },
        status: {
            type: String,
            default: "pending"
        },
    }]
})

const Cart = mongoose.model('Cart', cartSchema);

module.exports = Cart;

