const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Review = require('../../models/reviewSchema');
const Offer = require('../../models/offerSchema');

//Product details
const productDetails = async (req, res) => {
    try {
        const userId = req.session.user;
        const userData = await User.findById(userId);
        const productId = req.query.id;
        const product = await Product.findById(productId)
            .populate('category')
            .populate('brand');
        const reviews = await Review.find({ productId }).populate('user').lean();

        if (!product) {
            return res.redirect('/pageNotFound');
        }

        const findCategory = product.category;
        const categoryOffer = findCategory?.categoryOffer || 0; 
        const productOffer = product.productOffer || 0;

        const relatedProducts = await Product.find({
            category: findCategory._id,
            _id: { $ne: productId }
        });

        const totalRatings = reviews.length;
        const averageRating =
            totalRatings > 0
                ? reviews.reduce((sum, review) => sum + review.rating, 0) / totalRatings
                : 0;

        res.render('product-details', {
            user: userData,
            product: product,
            quantity: product.quantity,
            finalPrice: product.salePrice, 
            category: findCategory,
            relatedProducts: relatedProducts,
            reviews: reviews,
            averageRating: averageRating.toFixed(1),
            reviewCount: totalRatings,
            categoryOffer,
            productOffer
        });

       
    } catch (error) {
        console.log("Error in product view:", error);
        res.redirect('/pageNotFound');
    }
};

module.exports = {
    productDetails,
}