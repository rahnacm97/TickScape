const mongoose = require('mongoose');
const {Schema} = mongoose;

const userSchema = new Schema({
    fname : {
        type : String,
        required : true
    },
    lname : {
        type : String,
        required : true,
        default: "A"
    },
    email : {
        type : String,
        required : true,
        unique : true
    },
    phone : {
        type : String,
        required : false,
        unique : false,
        sparse : true,
        default : null 
    },
    googleId: {
        type: String,
        unique: false,
        default : null 
    },
    password: {
        type: String,
        required: false
    },
    confirmPassword: {
        type: String,
        required: false
    },
    isBlocked: {
        type: Boolean,
        default: false
    },
    isAdmin: {
        type: Boolean,
        default: false
    },
    cart: {
        type : Array
    },
    wallet: [{
        amount: { type: Number, required: true },
        date: { type: Date, default: Date.now }
    }],
    wishlist:[{
        type:Schema.Types.ObjectId,
        ref:"Wishlist"
    }],
    orderHistory: [{
        type: Schema.Types.ObjectId,
        ref: "Order"
    }],
    createdOn: {
        type: Date,
        default: Date.now
    },
    referalCode: {
        type: String,
        unique: true,  
        default: null
    },
    redeemed: {
        type: Boolean,
        default: false
    },
    redeemedUser: [{
        type: Schema.Types.ObjectId,
        ref: "User"
    }],
    otp:{
        type: String,
    },
    searchHistory: [{
        category: {
            type: Schema.Types.ObjectId,
            ref: "Category"
        },
        searchOn: {
            type: Date,
            default: Date.now
        }
    }]
})

const crypto = require('crypto');
userSchema.pre('save', function (next) {
    if (!this.referalCode) {
        this.referalCode = crypto.randomBytes(3).toString('hex');
    }
    next();
});

const User = mongoose.model('User',userSchema);

module.exports = User;