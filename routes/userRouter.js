const express = require('express');
const router = express.Router();
const passport = require('passport');
const Razorpay = require("razorpay");
const crypto = require("crypto");
const userController = require('../controllers/user/userController');
const profileController = require('../controllers/user/profileController');
const productController = require('../controllers/user/productController');
const cartController = require("../controllers/user/cartController");
const checkoutController = require("../controllers/user/checkoutController");
const orderController = require("../controllers/user/orderController");
const wishlistController = require('../controllers/user/wishlistController');

const {userAuth,adminAuth} = require('../middlewares/auth');

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

router.get('/pageNotFound',userController.pageNotFound);

//SignUp Management

router.get('/signup',userController.loadSignupPage);
router.post('/signup',userController.signup);
router.post('/verify-otp',userController.verifyOtp);
router.post('/resend-otp',userController.resendOtp);
router.get('/auth/google',passport.authenticate('google',{scope:['profile','email']}));

router.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/signup' }), async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            return res.redirect('/signup');
        }
        
        // req.session.user = user; 
        // res.locals.user = req.session.user;
        
        req.session.user = user._id;
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
router.get('/edit-profile',userAuth,profileController.geteditProfile);
router.put('/edit-profile',userAuth,profileController.editProfile);
router.get('/wallet-history',userAuth,profileController.walletHistory);

// Address Management
router.get('/address',userAuth,profileController.getAddress); 
router.get('/addAddress',userAuth,profileController.addAddress);
router.post('/addAddress',userAuth,profileController.userAddAddress);
router.get('/editAddress',userAuth,profileController.editAddress);
router.put('/editAddress',userAuth,profileController.userEditAddress);
router.delete('/deleteAddress',userAuth,profileController.deleteAddress);

//Shopping Management
router.get('/shop',userController.loadShoppingPage);
//router.get('/filter',userAuth,userController.filterProducts);

//Product Management
router.get('/productDetails',userAuth,productController.productDetails);

// Cart Management
router.get("/cart",userAuth,cartController.getCartPage);
router.post("/addToCart",userAuth,cartController.addToCart);
router.post("/changeQuantity",userAuth,cartController.changeQuantity);
router.delete("/deleteProduct", userAuth, cartController.deleteProduct);

// CheckOut Management
router.get('/checkCart', userAuth, checkoutController.checkCart);
router.get("/checkout",userAuth,checkoutController.getCheckout);
router.post('/placeOrder',userAuth,checkoutController.placeOrder);
//router.get("/get-coupon",userAuth,checkoutController.getCoupon);
router.post("/apply-coupon",userAuth,checkoutController.applyCoupon);
router.post("/remove-coupon",userAuth,checkoutController.removeCoupon );

//payment management
router.post('/razorpayPayment',userAuth,checkoutController.razorpayPayment);
router.post('/verifyRazorpay',userAuth,checkoutController.verifyRazorpay);
router.post('/savePendingOrder',userAuth,checkoutController.savePendingOrder);
router.get('/getUserWalletBalance',userAuth,checkoutController.getUserWalletBalance);
router.post('/deductWalletBalance',userAuth,checkoutController.deductWalletBalance);
router.get('/payment-failure',userAuth,checkoutController.paymentFailure);
//router.post('/cod-payment',userAuth,checkoutController.codPayment);


//Order Mangement
router.get('/orders',userAuth,orderController.getOrders);
router.get("/orderDetails",userAuth,orderController.getConfirmation);
router.get("/download-invoice/:orderId",userAuth,orderController.downloadInvoice);
router.get('/viewOrder/:orderid',userAuth,orderController.viewOrder);
router.delete('/cancelOrder/:itemId', userAuth,orderController.cancelOrder);
router.delete('/cancelParentOrder/:OrderId',userAuth,orderController.cancelParentOrder);
router.get('/writeReview',userAuth,orderController.getWriteReview);
router.post('/submitReview',userAuth,orderController.submitReview);
router.post('/returnOrderItem',userAuth,orderController.returnOrder);
router.post("/retryPayment/:orderId", userAuth,orderController.retryPayment);
router.post("/verifyRetryPayment", userAuth,orderController.verifyRetryPayment);

//Wishlist Management
router.get('/wishlist',userAuth,wishlistController.loadWishlist);
router.post('/addToWishlist',userAuth,wishlistController.addToWishlist);
router.delete('/removeFromWishlist',userAuth,wishlistController.removeProduct);

module.exports = router;