const express = require('express');
const router = express.Router();
const passport = require('passport');
const userController = require('../controllers/user/userController');
const profileController = require('../controllers/user/profileController');
const productController = require('../controllers/user/productController');
const wishlistController = require('../controllers/user/wishlistController');

const {userAuth,adminAuth} = require('../middlewares/auth');

router.get('/pageNotFound',userController.pageNotFound);

//SignUp Management

router.get('/signup',userController.loadSignupPage);
router.post('/signup',userController.signup);
router.post('/verify-otp',userController.verifyOtp);
router.post('/resend-otp',userController.resendOtp);
router.get('/auth/google',passport.authenticate('google',{scope:['profile','email']}));
router.get('/auth/google/callback',passport.authenticate('google',{failureRedirect:'/signup'}),(req,res) => {
    res.locals.user = req.user;
    res.redirect('/');
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
router.get('/filter',userAuth,userController.filterProducts);
router.get('/filterPrice',userAuth,userController.filterByPrice);
router.post('/search',userAuth,userController.searchProducts);

//Product Management
router.get('/productDetails',userAuth,productController.productDetails);

//Wishlist Management
router.get('/wishlist',userAuth,wishlistController.loadWishlist);
router.post('/addToWishlist',userAuth,wishlistController.addToWishlist);
router.get('/removeFromWishlist',userAuth,wishlistController.removeProduct);

module.exports = router;