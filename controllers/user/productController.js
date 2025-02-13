const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Review = require('../../models/reviewSchema');

const productDetails = async(req,res) => {
    try {
        const userId = req.session.user;
        const userData = await User.findById(userId);
        const productId = req.query.id;
        const product = await Product.findById(productId).populate('category').populate('brand');
        const reviews = await Review.find({productId}).populate('user').lean();
        const findCategory = product.category;
        const categoryOffer = findCategory ?.categoryOffer || 0;
        const productOffer = product.productOffer || 0;
        const totalOffer = categoryOffer + productOffer;

        const relatedProducts = await Product.find({
            category: findCategory._id,
            _id: { $ne: productId } 
        }).limit(3);

        //console.log("rel",relatedProducts);

        res.render('product-details',{
            user: userData,
            product: product,
            quantity: product.quantity,
            totalOffer: totalOffer,
            category: findCategory,
            relatedProducts: relatedProducts,
            reviews
        });
        //console.log("rel1",relatedProducts);
    } catch (error) {
        console.log("Error in product view",error);
        res.redirect('/pageNotFound');
    }
}

module.exports = {
    productDetails,
}