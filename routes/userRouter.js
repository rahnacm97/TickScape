const express = require('express');
const router = express.Router();
const passport = require('passport');
const userController = require('../controllers/user/userController');
const profileController = require('../controllers/user/profileController');
const productController = require('../controllers/user/productController');
const cartController = require("../controllers/user/cartController");
const checkoutController = require("../controllers/user/checkoutController");
const orderController = require("../controllers/user/orderController");
const wishlistController = require('../controllers/user/wishlistController');

const {userAuth,adminAuth} = require('../middlewares/auth');

router.get('/pageNotFound',userController.pageNotFound);

//SignUp Management

router.get('/signup',userController.loadSignupPage);
router.post('/signup',userController.signup);
router.post('/verify-otp',userController.verifyOtp);
router.post('/resend-otp',userController.resendOtp);
router.get('/auth/google',passport.authenticate('google',{scope:['profile','email']}));
// router.get('/auth/google/callback',passport.authenticate('google',{failureRedirect:'/signup'}),(req,res) => {
//      const user = req.session.user;
//         //req.session.user = findUser;
//         // Pass user to all views using res.locals
//         res.locals.user = req.session.user;
//     console.log("user");
//     res.redirect('/');
// });
router.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/signup' }), async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            return res.redirect('/signup');
        }
        
        req.session.user = user; 
        res.locals.user = req.session.user;
        
        console.log("User logged in:", user);
        res.redirect('/');
    } catch (err) {
        console.error("Google OAuth Error:", err);
        res.redirect('/signup');
    }
});


//Login Management && Home
router.get('/',userController.loadHomePage);
router.get('/login',userController.loadLoginPage);
router.post('/login',userController.login);
router.get('/logout',userAuth,userController.logout);

//Profile Management
router.get('/forgot-password',profileController.getForgotPassword);
router.post('/forgot-email-valid',profileController.forgotEmailValid);
router.post('/verify-passForgot-otp',profileController.verifyForgotPassOtp);
router.get('/reset-password',profileController.getResetPassword);
router.post('/resend-forgot-otp',profileController.resendForgotOtp);
router.post('/reset-password',profileController.postNewPassword);
router.get('/userProfile',userAuth,profileController.userProfile);
router.get('/change-email',userAuth,profileController.changeEmail);
router.post('/change-email',userAuth,profileController.changeEmailValid);
router.post('/verify-email-otp',userAuth,profileController.verifyEmailOtp);
router.post('/update-email',userAuth,profileController.updateEmail);
router.get('/change-password',userAuth,profileController.changePassword);
router.post('/change-password',userAuth,profileController.changePasswordValid);
router.post('/verify-changepassword-otp',userAuth,profileController.verifyChangePassOtp);

// Address Management 
router.get('/addAddress',userAuth,profileController.addAddress);
router.post('/addAddress',userAuth,profileController.userAddAddress);
router.get('/editAddress',userAuth,profileController.editAddress);
router.post('/editAddress',userAuth,profileController.userEditAddress);
router.get('/deleteAddress',userAuth,profileController.deleteAddress);

//Shopping Management
router.get('/shop',userController.loadShoppingPage);
//router.get('/filter',userAuth,userController.filterAndSortProducts);
router.get('/filter',userAuth,userController.filterProducts);
// router.get('/filterPrice',userAuth,userController.filterByPrice);
// router.get('/sort',userAuth,userController.getSortProduct);
// router.get('/sortProducts',userAuth,userController.sortProducts);
router.post('/search',userAuth,userController.searchProducts);

//Product Management
router.get('/productDetails',userAuth,productController.productDetails);

// Cart Management
router.get("/cart",userAuth,cartController.getCartPage);
router.post("/addToCart",userAuth,cartController.addToCart);
router.post("/changeQuantity",userAuth,cartController.changeQuantity);
router.get("/deleteProduct",userAuth,cartController.deleteProduct);

// CheckOut Management
router.get("/checkout",userAuth,checkoutController.getCheckout);
//router.get("/deleteItem", userAuth,checkoutController.deleteProduct);
router.post('/placeOrder',userAuth,checkoutController.placeOrder);

//Order Mangement
router.get("/orderDetails",userAuth,orderController.getConfirmation);
router.get('/viewOrder/:orderId',userAuth,orderController.viewOrder);
router.delete('/cancelOrder/:orderId', userAuth,orderController.cancelOrder);


//Wishlist Management
router.get('/wishlist',userAuth,wishlistController.loadWishlist);
router.post('/addToWishlist',userAuth,wishlistController.addToWishlist);
router.get('/removeFromWishlist',userAuth,wishlistController.removeProduct);

module.exports = router;