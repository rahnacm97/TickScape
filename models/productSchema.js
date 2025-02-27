const mongoose = require('mongoose');
const {Schema} = mongoose;

const productSchema = new Schema({
    productName: {
        type: String,
        required: true,
        //unique: true, 
        trim: true 
    },
    description: {
        type: String,
        required: true
    },
    brand: { 
        type: Schema.Types.ObjectId, 
        ref: "Brand",
        required: true
     },
    category: {
        type: Schema.Types.ObjectId,
        ref: "Category",
        required: true
    },
    regularPrice: {
        type: Number,
        required: true,
        min:0
    },
    salePrice: {
        type: Number,
        required: true,
        min: 0,
        validate: {
            validator: function (value) {
                return value <= this.regularPrice;
            },
            message: "Sale price must be less than or equal to regular price"
        }
    },
    gstRate: { 
        type: Number, 
        required: true,
        default: 18, 
        min: 0 
    },
    cgstRate: {
        type: Number,
        required: true,
        default: function () {
            return this.gstRate / 2; 
        }
    },
    sgstRate: {
        type: Number,
        required: true,
        default: function () {
            return this.gstRate / 2; 
        }
    },
    productOffer: {
        type: Number,
        default: 0,
        min: 0,
    },
    quantity: {
        type: Number,
        required: true,
        min:0
    },
    color: {
        type: String,
        required: true
    },
    productImage: {
        type: [String],
        required: true,
        validate: {
            validator: function (images) {
                return images.length > 0;
            },
            message: "At least one product image is required"
        }
    },
    isBlocked: {
        type: Boolean,
        default: false
    },
    status: {
        type: String,
        enum: ["Available","Out of Stock"],
        required: true,
        default: "Available"
    },
},{timestamps: true});

productSchema.pre('save', function (next) {
    if (this.quantity === 0) {
        this.status = "Out of Stock";
    } else {
        this.status = "Available";
    }
    next();
});

productSchema.index({ productName: 1 });
productSchema.index({ category: 1 });

const Product = mongoose.model('Product',productSchema);

module.exports = Product;
