const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');

const loadWishlist = async (req, res) => {
    try {
        const userId = req.session.user;
        const user = await User.findById(userId);

        if (!user) {
            return res.redirect('/pageNotFound');
        }

        const currentPage = parseInt(req.query.page) || 1;
        const itemsPerPage = 3;
        const skip = (currentPage - 1) * itemsPerPage; 

        const totalProducts = user.wishlist.length;
        const totalPages = Math.ceil(totalProducts / itemsPerPage);

        const products = await Product.find({ _id: { $in: user.wishlist } })
                                      .skip(skip)
                                      .limit(itemsPerPage)
                                      .populate('category')
                                      .populate('brand');
        res.render('wishlist', {
            user,
            wishlist: products,
            currentPage,
            totalPages
        });
    } catch (error) {
        console.error(error);
        res.redirect('/pageNotFound');
    }
};


const addToWishlist = async (req, res) => {
    try {
        const productId = req.body.productId;
        const userId = req.session.user;

        const user = await User.findById(userId);
        
        if (!user.wishlist) {
            user.wishlist = [];
        }

        console.log('Current Wishlist:', user.wishlist);

        if (user.wishlist.includes(productId)) {
            return res.status(200).json({ status: false, message: "Product already in wishlist" });
        }

        user.wishlist.push(productId);
        
        await user.save();

        return res.status(200).json({ status: true, message: "Product added to wishlist" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ status: false, message: "Internal Server Error" });
    }
}

const removeProduct = async(req,res) => {
    try {
        const productId = req.query.productId;
        const userId = req.session.user;
        const user = await User.findById(userId);
        const index = user.wishlist.indexOf(productId);
        user.wishlist.splice(index,1);
        await user.save();
        return res.redirect('/wishlist');
    } catch (error) {
        console.error(error);
        return res.status(500).json({status:false,message:"Internal Server Error"});
    }
}


module.exports = {
    loadWishlist,
    addToWishlist,
    removeProduct
}